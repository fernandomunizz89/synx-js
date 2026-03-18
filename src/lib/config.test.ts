import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadGlobalConfig,
  loadLocalProjectConfig,
  loadPromptFile,
  loadResolvedProjectConfig,
  resolveProviderConfigForAgent,
} from "./config.js";
import { writeJson } from "./fs.js";

const CONFIG_CACHE_ENV = "AI_AGENTS_DISABLE_CONFIG_CACHE";
const PROMPT_CACHE_ENV = "AI_AGENTS_DISABLE_PROMPT_CACHE";

const originalCwd = process.cwd();
const originalHome = process.env.HOME;
const originalConfigCache = process.env[CONFIG_CACHE_ENV];
const originalPromptCache = process.env[PROMPT_CACHE_ENV];

interface FixturePaths {
  root: string;
  repoRoot: string;
  homeRoot: string;
  globalConfigPath: string;
  localConfigPath: string;
  promptFilePath: string;
}

async function createFixture(): Promise<FixturePaths> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-config-test-"));
  const repoRoot = path.join(root, "repo");
  const homeRoot = path.join(root, "home");
  const globalConfigPath = path.join(homeRoot, ".ai-agents", "config.json");
  const localConfigPath = path.join(repoRoot, ".ai-agents", "config", "project.json");
  const promptFilePath = path.join(repoRoot, ".ai-agents", "prompts", "dispatcher.md");

  await fs.mkdir(path.join(repoRoot, ".ai-agents", "config"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "prompts"), { recursive: true });
  await fs.mkdir(path.join(homeRoot, ".ai-agents"), { recursive: true });

  await fs.writeFile(path.join(repoRoot, "package.json"), JSON.stringify({ name: "synx-config-test" }, null, 2), "utf8");
  await writeJson(globalConfigPath, {
    providers: {
      dispatcher: { type: "mock", model: "global-dispatcher" },
    },
    agentProviders: {},
    defaults: {
        humanReviewer: "Global Approver",
    },
  });
  await writeJson(localConfigPath, {
    projectName: "my-project",
    language: "TypeScript",
    framework: "Vite",
    humanReviewer: "",
    tasksDir: ".ai-agents/tasks",
    providerOverrides: {
      dispatcher: { model: "local-dispatcher" },
      agents: {
        "Synx Front Expert": { model: "local-front-expert" },
      },
    },
  });
  await fs.writeFile(promptFilePath, "dispatcher prompt v1", "utf8");

  return {
    root,
    repoRoot,
    homeRoot,
    globalConfigPath,
    localConfigPath,
    promptFilePath,
  };
}

describe.sequential("config", () => {
  let fixture: FixturePaths;

  beforeEach(async () => {
    fixture = await createFixture();
    process.env.HOME = fixture.homeRoot;
    delete process.env[CONFIG_CACHE_ENV];
    delete process.env[PROMPT_CACHE_ENV];
    process.chdir(fixture.repoRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);

    if (typeof originalHome === "string") process.env.HOME = originalHome;
    else delete process.env.HOME;

    if (typeof originalConfigCache === "string") process.env[CONFIG_CACHE_ENV] = originalConfigCache;
    else delete process.env[CONFIG_CACHE_ENV];

    if (typeof originalPromptCache === "string") process.env[PROMPT_CACHE_ENV] = originalPromptCache;
    else delete process.env[PROMPT_CACHE_ENV];

    await fs.rm(fixture.root, { recursive: true, force: true });
  });

  it("loads and validates global/local config files", async () => {
    const globalConfig = await loadGlobalConfig();
    const localConfig = await loadLocalProjectConfig();

    expect(globalConfig.providers.dispatcher.model).toBe("global-dispatcher");
    expect(localConfig.projectName).toBe("my-project");
    expect(localConfig.providerOverrides?.dispatcher?.model).toBe("local-dispatcher");
  });

  it("merges resolved config and reuses cache until file mtimes change", async () => {
    const first = await loadResolvedProjectConfig();
    const second = await loadResolvedProjectConfig();

    expect(second).toBe(first);
    expect(first.humanReviewer).toBe("Global Approver");
    expect(first.providers.dispatcher.model).toBe("local-dispatcher");
    if (first.providers.planner) {
      expect(first.providers.planner.model).toBe("global-planner");
    }

    await new Promise((resolve) => setTimeout(resolve, 12));
    await writeJson(fixture.localConfigPath, {
      projectName: "my-project",
      language: "TypeScript",
      framework: "Vite",
      humanReviewer: "Local Approver",
      tasksDir: ".ai-agents/tasks",
      providerOverrides: {
        dispatcher: { model: "local-dispatcher-v2" },
      },
    });

    const third = await loadResolvedProjectConfig();
    expect(third).not.toBe(first);
    expect(third.humanReviewer).toBe("Local Approver");
    expect(third.providers.dispatcher.model).toBe("local-dispatcher-v2");
  });

  it("resolves agent-specific provider config overrides", async () => {
    const resolved = await loadResolvedProjectConfig();
    expect(resolveProviderConfigForAgent(resolved, "Synx Front Expert").model).toBe("local-front-expert");
    expect(resolveProviderConfigForAgent(resolved, "Synx Back Expert")).toBe(resolved.providers.dispatcher);
  });

  it("bypasses resolved config cache when explicitly disabled", async () => {
    process.env[CONFIG_CACHE_ENV] = "1";

    const first = await loadResolvedProjectConfig();
    const second = await loadResolvedProjectConfig();

    expect(second).not.toBe(first);
  });

  it("caches prompt file content and invalidates by mtime or env opt-out", async () => {
    const first = await loadPromptFile("dispatcher.md");
    const second = await loadPromptFile("dispatcher.md");
    expect(first).toBe("dispatcher prompt v1");
    expect(second).toBe(first);

    await new Promise((resolve) => setTimeout(resolve, 12));
    await fs.writeFile(fixture.promptFilePath, "dispatcher prompt v2", "utf8");
    const third = await loadPromptFile("dispatcher.md");
    expect(third).toBe("dispatcher prompt v2");

    process.env[PROMPT_CACHE_ENV] = "1";
    await fs.writeFile(fixture.promptFilePath, "dispatcher prompt v3", "utf8");
    const fourth = await loadPromptFile("dispatcher.md");
    expect(fourth).toBe("dispatcher prompt v3");
  });
});
