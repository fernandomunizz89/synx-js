import path from "node:path";
import { existsSync, promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import { exists } from "./fs.js";
import { unique } from "./text-utils.js";

export interface CommandResult {
  command: string;
  args: string[];
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
}

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export async function runCommand(args: {
  command: string;
  commandArgs: string[];
  cwd: string;
  timeoutMs?: number;
  maxOutputChars?: number;
}): Promise<CommandResult> {
  const timeoutMs = args.timeoutMs ?? 120_000;
  const maxOutputChars = args.maxOutputChars ?? 12_000;

  return new Promise<CommandResult>((resolve) => {
    const startedAt = Date.now();
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const child = spawn(args.command, args.commandArgs, {
      cwd: args.cwd,
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const limit = (value: string, chunk: Buffer): string => {
      const appended = value + chunk.toString("utf8");
      if (appended.length <= maxOutputChars) return appended;
      return appended.slice(appended.length - maxOutputChars);
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = limit(stdout, chunk);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = limit(stderr, chunk);
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1500).unref();
    }, timeoutMs);

    const finalize = (exitCode: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({
        command: args.command,
        args: args.commandArgs,
        exitCode,
        timedOut,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr,
      });
    };

    child.on("error", (error) => {
      stderr = `${stderr}\n${error.message}`.trim();
      finalize(-1);
    });

    child.on("close", (code) => {
      finalize(code);
    });
  });
}

export async function isGitRepository(workspaceRoot: string): Promise<boolean> {
  const probe = await runCommand({
    command: "git",
    commandArgs: ["rev-parse", "--is-inside-work-tree"],
    cwd: workspaceRoot,
    timeoutMs: 8000,
    maxOutputChars: 300,
  });

  return probe.exitCode === 0 && probe.stdout.trim() === "true";
}

export async function getGitChangedFiles(workspaceRoot: string): Promise<string[]> {
  if (!(await isGitRepository(workspaceRoot))) return [];

  const trackedResult = await runCommand({
    command: "git",
    commandArgs: ["diff", "--name-only", "--"],
    cwd: workspaceRoot,
    timeoutMs: 12_000,
    maxOutputChars: 50_000,
  });

  if (trackedResult.exitCode !== 0) return [];

  const untrackedResult = await runCommand({
    command: "git",
    commandArgs: ["ls-files", "--others", "--exclude-standard"],
    cwd: workspaceRoot,
    timeoutMs: 12_000,
    maxOutputChars: 50_000,
  });

  const tracked = trackedResult.stdout
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  const untracked = untrackedResult.exitCode === 0
    ? untrackedResult.stdout
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean)
    : [];

  return unique([...tracked, ...untracked])
    .map((x) => x.trim())
    .filter((x) => Boolean(x) && !x.startsWith(".ai-agents/") && !x.startsWith(".git/"));
}

export function selectPackageManager(workspaceRoot: string): PackageManager {
  if (existsSync(path.join(workspaceRoot, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(path.join(workspaceRoot, "yarn.lock"))) return "yarn";
  if (existsSync(path.join(workspaceRoot, "bun.lockb")) || existsSync(path.join(workspaceRoot, "bun.lock"))) return "bun";
  return "npm";
}

export async function readPackageScripts(workspaceRoot: string): Promise<Record<string, string>> {
  const packageJsonPath = path.join(workspaceRoot, "package.json");
  if (!(await exists(packageJsonPath))) return {};

  try {
    const raw = await fs.readFile(packageJsonPath, "utf8");
    const parsed = JSON.parse(raw) as { scripts?: Record<string, string> };
    return parsed.scripts || {};
  } catch {
    return {};
  }
}

export function buildScriptCommand(
  manager: PackageManager,
  script: string,
  extraArgs: string[] = [],
): { command: string; args: string[] } {
  const withExtra = (base: string[]): string[] => {
    if (!extraArgs.length) return base;
    return [...base, "--", ...extraArgs];
  };

  switch (manager) {
    case "pnpm":
      return { command: "pnpm", args: withExtra(["run", "--if-present", script]) };
    case "yarn":
      return { command: "yarn", args: withExtra(["run", script]) };
    case "bun":
      return { command: "bun", args: withExtra(["run", script]) };
    case "npm":
    default:
      return { command: "npm", args: withExtra(["run", "--if-present", script]) };
  }
}
