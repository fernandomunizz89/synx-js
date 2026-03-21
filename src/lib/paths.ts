import path from "node:path";
import os from "node:os";
import { AGENTS_DIR, AI_ROOT, CONFIG_DIR, LOCKS_DIR, LOGS_DIR, PROMPTS_DIR, RUNTIME_DIR, TASKS_DIR } from "./constants.js";
import { findRepoRoot } from "./repo.js";

export function repoRoot(): string {
  return findRepoRoot(process.cwd());
}

export function aiRoot(): string {
  return path.join(repoRoot(), AI_ROOT);
}

export function configDir(): string {
  return path.join(repoRoot(), CONFIG_DIR);
}

export function promptsDir(): string {
  return path.join(repoRoot(), PROMPTS_DIR);
}

export function agentsDir(): string {
  return path.join(repoRoot(), AGENTS_DIR);
}

export function runtimeDir(): string {
  return path.join(repoRoot(), RUNTIME_DIR);
}

export function locksDir(): string {
  return path.join(repoRoot(), LOCKS_DIR);
}

export function logsDir(): string {
  return path.join(repoRoot(), LOGS_DIR);
}

export function tasksDir(): string {
  return path.join(repoRoot(), TASKS_DIR);
}

export function taskDir(taskId: string): string {
  return path.join(tasksDir(), taskId);
}

export function globalAiRoot(): string {
  return path.join(os.homedir(), ".ai-agents");
}

export function globalConfigPath(): string {
  return path.join(globalAiRoot(), "config.json");
}
