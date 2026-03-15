import path from "node:path";
import { readJson, readText, statSafe } from "./fs.js";
import { configDir, globalConfigPath, promptsDir } from "./paths.js";
import { globalConfigSchema, localProjectConfigSchema } from "./schema.js";
import type { GlobalConfig, LocalProjectConfig, ResolvedProjectConfig, ProviderStageConfig } from "./types.js";

function mergeProvider(base: ProviderStageConfig, override?: Partial<ProviderStageConfig>): ProviderStageConfig {
  return { ...base, ...(override || {}) };
}

interface ResolvedConfigCacheEntry {
  globalPath: string;
  localPath: string;
  globalMtimeMs: number;
  localMtimeMs: number;
  value: ResolvedProjectConfig;
}

interface PromptCacheEntry {
  filePath: string;
  mtimeMs: number;
  content: string;
}

const resolvedConfigCache = new Map<string, ResolvedConfigCacheEntry>();
const promptFileCache = new Map<string, PromptCacheEntry>();
let cachedPromptsRoot = "";

function isCacheDisabled(envName: string): boolean {
  const value = String(process.env[envName] || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

async function getMtimeMs(filePath: string): Promise<number> {
  const stat = await statSafe(filePath);
  return stat?.mtimeMs ?? -1;
}

export async function loadGlobalConfig(): Promise<GlobalConfig> {
  const raw = await readJson<unknown>(globalConfigPath());
  return globalConfigSchema.parse(raw);
}

export async function loadLocalProjectConfig(): Promise<LocalProjectConfig> {
  const raw = await readJson<unknown>(path.join(configDir(), "project.json"));
  return localProjectConfigSchema.parse(raw);
}

export async function loadResolvedProjectConfig(): Promise<ResolvedProjectConfig> {
  const globalPath = globalConfigPath();
  const localPath = path.join(configDir(), "project.json");
  const cacheKey = process.cwd();
  const cacheDisabled = isCacheDisabled("AI_AGENTS_DISABLE_CONFIG_CACHE");

  if (!cacheDisabled) {
    const cached = resolvedConfigCache.get(cacheKey);
    if (cached && cached.globalPath === globalPath && cached.localPath === localPath) {
      const [globalMtimeMs, localMtimeMs] = await Promise.all([
        getMtimeMs(globalPath),
        getMtimeMs(localPath),
      ]);
      if (cached.globalMtimeMs === globalMtimeMs && cached.localMtimeMs === localMtimeMs) {
        return cached.value;
      }
    }
  }

  const globalConfig = await loadGlobalConfig();
  const localConfig = await loadLocalProjectConfig();
  const resolved: ResolvedProjectConfig = {
    projectName: localConfig.projectName,
    language: localConfig.language,
    framework: localConfig.framework,
    humanReviewer: localConfig.humanReviewer || globalConfig.defaults.humanReviewer,
    tasksDir: localConfig.tasksDir,
    providers: {
      dispatcher: mergeProvider(globalConfig.providers.dispatcher, localConfig.providerOverrides?.dispatcher),
      planner: mergeProvider(globalConfig.providers.planner, localConfig.providerOverrides?.planner),
    },
  };

  if (!cacheDisabled) {
    const [globalMtimeMs, localMtimeMs] = await Promise.all([
      getMtimeMs(globalPath),
      getMtimeMs(localPath),
    ]);
    resolvedConfigCache.set(cacheKey, {
      globalPath,
      localPath,
      globalMtimeMs,
      localMtimeMs,
      value: resolved,
    });
  }

  return resolved;
}

export async function loadPromptFile(fileName: string): Promise<string> {
  const root = promptsDir();
  const filePath = path.join(root, fileName);
  const cacheDisabled = isCacheDisabled("AI_AGENTS_DISABLE_PROMPT_CACHE");
  if (cacheDisabled) return readText(filePath);

  if (cachedPromptsRoot && cachedPromptsRoot !== root) {
    promptFileCache.clear();
  }
  cachedPromptsRoot = root;

  const currentMtimeMs = await getMtimeMs(filePath);
  const cacheKey = `${root}::${fileName}`;
  const cached = promptFileCache.get(cacheKey);
  if (cached && cached.filePath === filePath && cached.mtimeMs === currentMtimeMs) {
    return cached.content;
  }

  const content = await readText(filePath);
  promptFileCache.set(cacheKey, {
    filePath,
    mtimeMs: currentMtimeMs,
    content,
  });
  return content;
}
