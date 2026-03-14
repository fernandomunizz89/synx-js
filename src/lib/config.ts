import path from "node:path";
import { readJson, readText } from "./fs.js";
import { configDir, globalConfigPath, promptsDir } from "./paths.js";
import { globalConfigSchema, localProjectConfigSchema } from "./schema.js";
import type { GlobalConfig, LocalProjectConfig, ResolvedProjectConfig, ProviderStageConfig } from "./types.js";

function mergeProvider(base: ProviderStageConfig, override?: Partial<ProviderStageConfig>): ProviderStageConfig {
  return { ...base, ...(override || {}) };
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
  const globalConfig = await loadGlobalConfig();
  const localConfig = await loadLocalProjectConfig();

  return {
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
}

export async function loadPromptFile(fileName: string): Promise<string> {
  return readText(path.join(promptsDir(), fileName));
}
