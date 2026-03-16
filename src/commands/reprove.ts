import path from "node:path";
import { Command } from "commander";
import { promises as fs } from "node:fs";
import { ensureGlobalInitialized, ensureProjectInitialized } from "../lib/bootstrap.js";
import { allTaskIds, loadTaskMeta, saveTaskMeta } from "../lib/task.js";
import { logTaskEvent } from "../lib/logging.js";
import { DONE_FILE_NAMES, STAGE_FILE_NAMES } from "../lib/constants.js";
import { confirmAction, selectOption } from "../lib/interactive.js";
import { commandExample } from "../lib/cli-command.js";
import { collectReadinessReport, printReadinessReport } from "../lib/readiness.js";
import { exists, readJson, writeJson } from "../lib/fs.js";
import { taskDir, repoRoot } from "../lib/paths.js";
import { isGitRepository, runCommand } from "../lib/command-runner.js";
import { nowIso } from "../lib/utils.js";
import { unique } from "../lib/text-utils.js";
import type { AgentName, StageEnvelope, TaskType } from "../lib/types.js";

type RollbackMode = "none" | "task";

function parseRollbackMode(value: string | undefined): RollbackMode {
  const normalized = String(value || "none").trim().toLowerCase();
  if (!normalized || normalized === "none" || normalized === "off" || normalized === "false") return "none";
  if (normalized === "task" || normalized === "scoped") return "task";
  throw new Error(`Invalid --rollback value "${value}". Use: none | task`);
}

function remediationTarget(taskType: TaskType): {
  agent: AgentName;
  stage: string;
  requestFileName: string;
} {
  if (taskType === "Bug") {
    return {
      agent: "Bug Fixer",
      stage: "bug-fixer",
      requestFileName: STAGE_FILE_NAMES.bugFixer,
    };
  }

  return {
    agent: "Feature Builder",
    stage: "builder",
    requestFileName: STAGE_FILE_NAMES.builder,
  };
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

  for (const name of [DONE_FILE_NAMES.builder, DONE_FILE_NAMES.bugFixer]) {
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

  return unique(files.filter(isSafeWorkspacePath));
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

async function applyTaskRollback(taskId: string): Promise<{
  requested: number;
  trackedRestored: string[];
  untrackedRemoved: string[];
  skipped: string[];
  warnings: string[];
}> {
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

  if (!(await isGitRepository(workspaceRoot))) {
    return {
      requested: changedFiles.length,
      trackedRestored: [],
      untrackedRemoved: [],
      skipped: [...changedFiles],
      warnings: ["Rollback requested, but current workspace is not a git repository."],
    };
  }

  const tracked: string[] = [];
  const untracked: string[] = [];

  for (const file of changedFiles) {
    const absolutePath = path.resolve(workspaceRoot, file);
    const safePrefix = `${workspaceRoot}${path.sep}`;
    if (!(absolutePath === workspaceRoot || absolutePath.startsWith(safePrefix))) {
      warnings.push(`Skipped unsafe rollback path: ${file}`);
      continue;
    }

    if (await isTrackedFile(workspaceRoot, file)) tracked.push(file);
    else untracked.push(file);
  }

  const trackedRestored: string[] = [];
  const untrackedRemoved: string[] = [];
  const skipped: string[] = [];

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

export const reproveCommand = new Command("reprove")
  .description("Reject human review and return the task to implementation")
  .option("--task-id <taskId>", "task id")
  .option("--reason <reason>", "human rejection reason")
  .option("--rollback <mode>", "rollback mode: none | task", "none")
  .option("--yes", "skip confirmation prompt")
  .action(async (options) => {
    await ensureGlobalInitialized();
    await ensureProjectInitialized();
    const readiness = await collectReadinessReport({ includeProviderChecks: false });
    printReadinessReport(readiness, "Readiness checks");

    const rollbackMode = parseRollbackMode(options.rollback as string | undefined);
    const reason = String(options.reason || "").trim();

    let taskId = options.taskId as string | undefined;
    if (!taskId) {
      const taskIds = await allTaskIds();
      if (!taskIds.length) {
        console.log("\nNo tasks found.");
        console.log(`Next step: run \`${commandExample("new")}\` to create your first task.`);
        return;
      }

      const metas = await Promise.all(taskIds.map((id) => loadTaskMeta(id)));
      const waiting = metas
        .filter((meta) => meta.humanApprovalRequired || meta.status === "waiting_human")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      if (!waiting.length) {
        console.log("\nNo tasks are waiting for human review.");
        console.log(`Next step: run \`${commandExample("status")}\` to see active and failed tasks.`);
        return;
      }

      if (options.yes && waiting.length === 1) {
        taskId = waiting[0].taskId;
        console.log(`\nSingle pending task found. Auto-selected: ${taskId}`);
      } else {
        taskId = await selectOption(
          "Choose task to reprove",
          waiting.map((meta) => ({
            value: meta.taskId,
            label: `${meta.taskId} | ${meta.title}`,
            description: `Type: ${meta.type} | Stage: ${meta.currentStage}`,
          })),
          waiting[0].taskId,
        );
      }
    }

    const meta = await loadTaskMeta(taskId);
    if (!meta.humanApprovalRequired) {
      console.log("\nThis task is not waiting for human review.");
      console.log(`Next step: run \`${commandExample("status")}\` to see which tasks need action.`);
      return;
    }

    const target = remediationTarget(meta.type);

    if (!options.yes) {
      const rollbackLabel = rollbackMode === "task" ? " with task-scoped rollback" : "";
      const confirmed = await confirmAction(`Reprove task ${taskId} and return it to ${target.agent}${rollbackLabel}?`, true);
      if (!confirmed) {
        console.log("\nReprove canceled.");
        return;
      }
    }

    let rollbackSummary: {
      requested: number;
      trackedRestored: string[];
      untrackedRemoved: string[];
      skipped: string[];
      warnings: string[];
    } | null = null;

    if (rollbackMode === "task") {
      rollbackSummary = await applyTaskRollback(taskId);
    }

    const now = nowIso();
    const qaDoneRef = `done/${DONE_FILE_NAMES.qa}`;
    const prDoneRef = `done/${DONE_FILE_NAMES.pr}`;
    const nextInputRef = await exists(path.join(taskDir(taskId), qaDoneRef)) ? qaDoneRef : prDoneRef;

    meta.status = "waiting_agent";
    meta.currentStage = "reproved";
    meta.currentAgent = "Human Review";
    meta.nextAgent = target.agent;
    meta.humanApprovalRequired = false;
    await saveTaskMeta(taskId, meta);

    const stageRequest: StageEnvelope = {
      taskId,
      stage: target.stage,
      status: "request",
      createdAt: now,
      agent: target.agent,
      inputRef: nextInputRef,
    };

    await writeJson(path.join(taskDir(taskId), "inbox", target.requestFileName), stageRequest);
    await writeJson(path.join(taskDir(taskId), "human", "90-final-review.reproved.json"), {
      taskId,
      stage: "human-review",
      status: "done",
      createdAt: now,
      agent: "Human Review",
      output: {
        decision: "reproved",
        returnedTo: target.agent,
        reason: reason || "",
        rollbackMode,
        rollbackSummary,
      },
    });

    const detailBits = [
      `Human reprove completed. Task returned to ${target.agent}.`,
      reason ? `Reason: ${reason}` : "Reason: [not provided]",
      rollbackMode === "task"
        ? `Rollback (task): restored=${rollbackSummary?.trackedRestored.length || 0}, removed=${rollbackSummary?.untrackedRemoved.length || 0}, skipped=${rollbackSummary?.skipped.length || 0}.`
        : "Rollback: none (default safe mode).",
    ];
    await logTaskEvent(taskDir(taskId), detailBits.join(" "));

    console.log(`\nTask reproved: ${taskId}`);
    console.log(`- Returned to: ${target.agent}`);
    if (reason) console.log(`- Reason: ${reason}`);
    if (rollbackMode === "task" && rollbackSummary) {
      console.log(`- Rollback requested files: ${rollbackSummary.requested}`);
      console.log(`- Tracked files restored: ${rollbackSummary.trackedRestored.length}`);
      console.log(`- Untracked files removed: ${rollbackSummary.untrackedRemoved.length}`);
      console.log(`- Files skipped: ${rollbackSummary.skipped.length}`);
      if (rollbackSummary.warnings.length) {
        for (const warning of rollbackSummary.warnings.slice(0, 6)) {
          console.log(`- Rollback warning: ${warning}`);
        }
      }
    } else {
      console.log("- Rollback: none (use --rollback task to revert task-scoped files explicitly)");
    }
    console.log(`Next step: keep \`${commandExample("start")}\` running and monitor with \`${commandExample("status")}\`.`);
  });
