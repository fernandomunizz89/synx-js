import { Command } from "commander";
import { ensureGlobalInitialized, ensureProjectInitialized } from "../lib/bootstrap.js";
import { exists } from "../lib/fs.js";
import { globalConfigPath, aiRoot, promptsDir, tasksDir } from "../lib/paths.js";
import { loadResolvedProjectConfig } from "../lib/config.js";
import { checkProviderHealth } from "../lib/provider-health.js";
import { listDirectories } from "../lib/fs.js";
import { providerHealthToHuman } from "../lib/human-messages.js";
import { confirmAction } from "../lib/interactive.js";
import { clearStaleLocks, detectInterruptedTasks, detectStaleLocks, detectWorkingOrphans, recoverInterruptedTasks, recoverWorkingFiles } from "../lib/runtime.js";
import { commandExample } from "../lib/cli-command.js";
import { REQUIRED_PROMPT_FILES } from "../lib/constants.js";
import path from "node:path";
import type { ProviderStageConfig } from "../lib/types.js";

const DEFAULT_OPENAI_BASE_URL_ENV = "AI_AGENTS_OPENAI_BASE_URL";
const DEFAULT_OPENAI_API_KEY_ENV = "AI_AGENTS_OPENAI_API_KEY";

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function buildProviderEnvCheck(label: string, config: ProviderStageConfig): { label: string; ok: boolean; message: string } {
  if (config.type === "mock") {
    return {
      label: `${label} env vars`,
      ok: true,
      message: "Mock provider selected; no environment variables are required.",
    };
  }

  if (config.type === "lmstudio") {
    return {
      label: `${label} env vars`,
      ok: true,
      message: "LM Studio provider resolves connection from saved config, LM Studio defaults, or optional env overrides.",
    };
  }

  const baseUrlEnv = (config.baseUrlEnv || DEFAULT_OPENAI_BASE_URL_ENV).trim() || DEFAULT_OPENAI_BASE_URL_ENV;
  const apiKeyEnv = (config.apiKeyEnv || DEFAULT_OPENAI_API_KEY_ENV).trim() || DEFAULT_OPENAI_API_KEY_ENV;
  const resolvedBaseUrl = (config.baseUrl || process.env[baseUrlEnv] || "").trim();
  const resolvedApiKey = (config.apiKey || process.env[apiKeyEnv] || "").trim();
  const missing: string[] = [];
  const invalid: string[] = [];

  if (!resolvedBaseUrl) {
    missing.push(config.baseUrl ? "provider.baseUrl" : baseUrlEnv);
  } else if (!isValidHttpUrl(resolvedBaseUrl)) {
    invalid.push(`base URL is not a valid http(s) URL (${resolvedBaseUrl})`);
  }

  if (!resolvedApiKey) {
    missing.push(config.apiKey ? "provider.apiKey" : apiKeyEnv);
  }

  if (!missing.length && !invalid.length) {
    const baseUrlSource = config.baseUrl ? "config" : `env:${baseUrlEnv}`;
    const apiKeySource = config.apiKey ? "config" : `env:${apiKeyEnv}`;
    return {
      label: `${label} env vars`,
      ok: true,
      message: `Resolved base URL from ${baseUrlSource} and API key from ${apiKeySource}.`,
    };
  }

  const detailParts: string[] = [];
  if (missing.length) detailParts.push(`Missing: ${missing.join(", ")}`);
  if (invalid.length) detailParts.push(`Invalid: ${invalid.join(", ")}`);
  return {
    label: `${label} env vars`,
    ok: false,
    message: detailParts.join(" | "),
  };
}

export const doctorCommand = new Command("doctor")
  .description("Run human-friendly diagnostics")
  .option("--fix", "apply safe fixes after diagnostics")
  .action(async (options) => {
    await ensureGlobalInitialized();
    await ensureProjectInitialized();

    const checks: Array<{ label: string; ok: boolean; message: string }> = [];

    checks.push({
      label: "Global config",
      ok: await exists(globalConfigPath()),
      message: await exists(globalConfigPath()) ? "Found global config." : "Missing global config.",
    });

    checks.push({
      label: "Local .ai-agents",
      ok: await exists(aiRoot()),
      message: await exists(aiRoot()) ? "Found local .ai-agents folder." : "Missing local .ai-agents folder.",
    });

    checks.push({
      label: "Prompts",
      ok: await exists(promptsDir()),
      message: await exists(promptsDir()) ? "Prompt folder exists." : "Prompt folder is missing.",
    });

    const missingPrompts: string[] = [];
    for (const promptFile of REQUIRED_PROMPT_FILES) {
      if (!(await exists(path.join(promptsDir(), promptFile)))) {
        missingPrompts.push(promptFile);
      }
    }
    checks.push({
      label: "Prompt files",
      ok: missingPrompts.length === 0,
      message: missingPrompts.length
        ? `Missing ${missingPrompts.length} file(s): ${missingPrompts.join(", ")}`
        : "All required prompt files are present.",
    });

    const config = await loadResolvedProjectConfig();
    checks.push({
      label: "Human reviewer",
      ok: Boolean(config.humanReviewer.trim()),
      message: config.humanReviewer.trim()
        ? `Configured as "${config.humanReviewer}".`
        : `Missing reviewer name. Run \`${commandExample("setup")}\` to set it explicitly.`,
    });

    checks.push(buildProviderEnvCheck("Dispatcher provider", config.providers.dispatcher));
    checks.push(buildProviderEnvCheck("Planner provider", config.providers.planner));

    const dispatcherHealth = await checkProviderHealth(config.providers.dispatcher);
    const plannerHealth = await checkProviderHealth(config.providers.planner);

    checks.push({
      label: "Dispatcher provider",
      ok: dispatcherHealth.reachable && (dispatcherHealth.modelFound ?? true),
      message: providerHealthToHuman(dispatcherHealth.message),
    });

    checks.push({
      label: "Planner provider",
      ok: plannerHealth.reachable && (plannerHealth.modelFound ?? true),
      message: providerHealthToHuman(plannerHealth.message),
    });

    const taskFolders = await (await exists(tasksDir()) ? listDirectories(tasksDir()) : Promise.resolve([]));
    checks.push({
      label: "Task storage",
      ok: true,
      message: `${taskFolders.length} task folder(s) found.`,
    });

    const staleLocks = await detectStaleLocks();
    checks.push({
      label: "Stale locks",
      ok: staleLocks.length === 0,
      message: staleLocks.length ? `${staleLocks.length} stale lock(s) can be cleaned.` : "No stale locks found.",
    });

    const orphanWorking = await detectWorkingOrphans();
    checks.push({
      label: "Orphan working files",
      ok: orphanWorking.length === 0,
      message: orphanWorking.length ? `${orphanWorking.length} working file(s) can be recovered safely.` : "No orphan working files found.",
    });

    const interruptedTasks = await detectInterruptedTasks();
    const recoverableInterrupted = interruptedTasks.filter((item) => item.action === "requeued");
    const unresolvedInterrupted = interruptedTasks.filter((item) => item.action !== "requeued");
    checks.push({
      label: "Interrupted tasks",
      ok: interruptedTasks.length === 0,
      message: interruptedTasks.length
        ? `${recoverableInterrupted.length} recoverable and ${unresolvedInterrupted.length} requiring manual review.`
        : "No interrupted tasks found.",
    });

    console.log("\nDoctor results");
    for (const check of checks) {
      console.log(`${check.ok ? "✓" : "✗"} ${check.label}: ${check.message}`);
    }

    const hasIssues = checks.some((check) => !check.ok);
    if (!hasIssues) {
      console.log("\nEnvironment looks healthy.");
      console.log(`Next step: run \`${commandExample("new")}\` or \`${commandExample("status")}\`.`);
      return;
    }

    const shouldFix = options.fix ? true : await confirmAction("Run safe automatic fixes now?", false);
    if (!shouldFix) {
      console.log("\nNo fixes applied.");
      console.log(`Next step: run \`${commandExample("fix")}\` to repair issues.`);
      return;
    }

    const clearedLocks = await clearStaleLocks();
    const recoveredWorking = await recoverWorkingFiles();
    const recoveredTasks = await recoverInterruptedTasks();
    const unresolvedRecoveredTasks = recoveredTasks.filter((item) => item.action !== "requeued");

    console.log("\nFix summary");
    console.log(`- Stale locks cleared: ${clearedLocks.length}`);
    console.log(`- Working files recovered: ${recoveredWorking.length}`);
    console.log(`- Interrupted tasks requeued: ${recoveredTasks.filter((item) => item.action === "requeued").length}`);
    if (unresolvedRecoveredTasks.length) {
      console.log(`- Interrupted tasks still requiring manual review: ${unresolvedRecoveredTasks.length}`);
    }
    console.log(`Next step: run \`${commandExample("start")}\` or \`${commandExample("status")}\`.`);
  });
