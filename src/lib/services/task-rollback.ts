import path from "node:path";
import { promises as fs } from "node:fs";
import { DONE_FILE_NAMES } from "../constants.js";
import { exists, readJson } from "../fs.js";
import { repoRoot, taskDir } from "../paths.js";
import { runCommand, isGitRepository } from "../command-runner.js";
import { unique } from "../text-utils.js";

export interface RollbackSummary {
  requested: number;
  trackedRestored: string[];
  untrackedRemoved: string[];
  skipped: string[];
  warnings: string[];
}

function normalizeWorkspacePath(value: string): string {
  return value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "");
}

function isSafeWorkspacePath(value: string): boolean {
  if (!value) return false;
  if (value.startsWith(".ai-agents/")) return false;
  if (value.includes("..")) return false;
  return !path.isAbsolute(value);
}

async function collectTaskChangedFiles(taskId: string): Promise<string[]> {
  const base = taskDir(taskId);
  const doneDir = path.join(base, "done");
  const files: string[] = [];

  for (const name of [
    DONE_FILE_NAMES.synxFrontExpert,
    DONE_FILE_NAMES.synxMobileExpert,
    DONE_FILE_NAMES.synxBackExpert,
    DONE_FILE_NAMES.synxSeoSpecialist,
  ]) {
    const target = path.join(doneDir, name);
    if (!(await exists(target))) continue;

    try {
      const envelope = await readJson<{ output?: { filesChanged?: unknown; edits?: unknown } }>(target);
      const changed = envelope.output?.filesChanged;
      if (Array.isArray(changed)) {
        for (const row of changed) {
          if (typeof row !== "string") continue;
          files.push(normalizeWorkspacePath(row));
        }
      }

      const edits = envelope.output?.edits;
      if (Array.isArray(edits)) {
        for (const edit of edits) {
          if (!edit || typeof edit !== "object") continue;
          const p = (edit as { path?: unknown }).path;
          if (typeof p === "string") files.push(normalizeWorkspacePath(p));
        }
      }
    } catch {
      // Ignore malformed artifacts and keep collecting from other stage outputs.
    }
  }

  return unique(files); // Don't filter here, let the main function handle it with warnings
}

async function isTrackedFile(workspaceRoot: string, relativePath: string): Promise<boolean> {
  const probe = await runCommand({
    command: "git",
    commandArgs: ["ls-files", "--error-unmatch", "--", relativePath],
    cwd: workspaceRoot,
    timeoutMs: 10_000,
    maxOutputChars: 1_000,
  });
  return probe.exitCode === 0;
}

export async function applyTaskRollback(taskId: string): Promise<RollbackSummary> {
  const workspaceRoot = repoRoot();
  const changedFiles = await collectTaskChangedFiles(taskId);
  const warnings: string[] = [];

  if (!changedFiles.length) {
    return {
      requested: 0,
      trackedRestored: [],
      untrackedRemoved: [],
      skipped: [],
      warnings: ["No implementation file list found for this task. Nothing was rolled back."],
    };
  }

  const isGit = await isGitRepository(workspaceRoot);
  if (!isGit) {
    warnings.push("Current workspace is not a git repository. Tracked file restoration skipped.");
  }

  const tracked: string[] = [];
  const untracked: string[] = [];
  const trackedRestored: string[] = [];
  const untrackedRemoved: string[] = [];
  const skipped: string[] = [];

  for (const file of changedFiles) {
    if (!isSafeWorkspacePath(file)) {
      warnings.push(`Skipped unsafe rollback path: ${file}`);
      skipped.push(file);
      continue;
    }

    if (isGit && (await isTrackedFile(workspaceRoot, file))) tracked.push(file);
    else untracked.push(file);
  }

  if (tracked.length) {
    const restore = await runCommand({
      command: "git",
      commandArgs: ["restore", "--source=HEAD", "--worktree", "--staged", "--", ...tracked],
      cwd: workspaceRoot,
      timeoutMs: 30_000,
      maxOutputChars: 8_000,
    });

    if (restore.exitCode === 0) {
      trackedRestored.push(...tracked);
    } else {
      warnings.push(`Git restore failed during rollback: ${restore.stderr || restore.stdout || "unknown error"}`);
      skipped.push(...tracked);
    }
  }

  for (const file of untracked) {
    const absolutePath = path.resolve(workspaceRoot, file);
    const safePrefix = `${workspaceRoot}${path.sep}`;
    if (!(absolutePath === workspaceRoot || absolutePath.startsWith(safePrefix))) {
      skipped.push(file);
      continue;
    }
    try {
      if (await exists(absolutePath)) {
        await fs.rm(absolutePath, { recursive: true, force: true });
        untrackedRemoved.push(file);
      }
    } catch {
      skipped.push(file);
    }
  }

  return {
    requested: changedFiles.length,
    trackedRestored: unique(trackedRestored),
    untrackedRemoved: unique(untrackedRemoved),
    skipped: unique(skipped),
    warnings: unique(warnings),
  };
}
