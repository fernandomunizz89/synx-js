import path from "node:path";
import { promises as fs } from "node:fs";
import { ensureDir, exists, listDirectories, listFiles, moveFile, readJson, statSafe, writeJson } from "./fs.js";
import { locksDir, taskDir, tasksDir } from "./paths.js";
import { DONE_FILE_NAMES, STAGE_FILE_NAMES, STALE_LOCK_MINUTES } from "./constants.js";
import { loadTaskMeta, saveTaskMeta } from "./task.js";
import type { AgentName, StageEnvelope } from "./types.js";
import { nowIso } from "./utils.js";

interface LockStatePayload {
  pid?: number;
  createdAt?: string;
}

export interface StaleLockResult {
  file: string;
  reason: string;
  ageMinutes: number;
  pid?: number;
}

export interface WorkingRecoveryResult {
  taskId: string;
  file: string;
  action: "requeued" | "moved_to_failed";
  reason: string;
}

export interface InterruptedTaskRecoveryResult {
  taskId: string;
  action: "requeued" | "skipped";
  reason: string;
  requestFile?: string;
}

interface NextStageRequest {
  stage: string;
  requestFileName: string;
  inputRef: string;
  agent: AgentName;
}

const WORKING_TO_REQUEST_FILE: Record<string, string> = {
  "00-dispatcher.working.json": STAGE_FILE_NAMES.dispatcher,
  "02-planner.working.json": STAGE_FILE_NAMES.planner,
  "02b-bug-investigator.working.json": STAGE_FILE_NAMES.bugInvestigator,
  "04-builder.working.json": STAGE_FILE_NAMES.builder,
  "05-reviewer.working.json": STAGE_FILE_NAMES.reviewer,
  "06-qa.working.json": STAGE_FILE_NAMES.qa,
  "07-pr.working.json": STAGE_FILE_NAMES.pr,
};

function processIsRunning(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "EPERM") {
      return true;
    }
    return false;
  }
}

function getAgeMinutes(createdAtMs: number, fallbackMs: number): number {
  const sourceMs = Number.isFinite(createdAtMs) ? createdAtMs : fallbackMs;
  return (Date.now() - sourceMs) / 60000;
}

async function collectStaleLocks(): Promise<Array<{ filePath: string; result: StaleLockResult }>> {
  const dir = locksDir();
  if (!(await exists(dir))) return [];

  const files = await listFiles(dir);
  const stale: Array<{ filePath: string; result: StaleLockResult }> = [];

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = await statSafe(fullPath);
    if (!stat) continue;

    let payload: LockStatePayload | null = null;
    try {
      payload = await readJson<LockStatePayload>(fullPath);
    } catch {
      payload = null;
    }

    const createdAtMs = payload?.createdAt ? new Date(payload.createdAt).getTime() : Number.NaN;
    const ageMinutes = getAgeMinutes(createdAtMs, stat.mtimeMs);
    const pid = payload?.pid;

    const reasons: string[] = [];
    if (ageMinutes >= STALE_LOCK_MINUTES) reasons.push(`older than ${STALE_LOCK_MINUTES} minutes`);
    if (typeof pid === "number" && !processIsRunning(pid)) reasons.push(`PID ${pid} is not running`);

    if (reasons.length) {
      stale.push({
        filePath: fullPath,
        result: {
          file,
          reason: reasons.join("; "),
          ageMinutes: Number(ageMinutes.toFixed(1)),
          pid,
        },
      });
    }
  }

  return stale;
}

async function inferNextRequest(taskId: string, nextAgent: AgentName): Promise<NextStageRequest | null> {
  const done = (fileName: string) => path.join(taskDir(taskId), "done", fileName);

  switch (nextAgent) {
    case "Dispatcher":
      return {
        stage: "dispatcher",
        requestFileName: STAGE_FILE_NAMES.dispatcher,
        inputRef: "input/new-task.json",
        agent: "Dispatcher",
      };
    case "Spec Planner":
      if (!(await exists(done(DONE_FILE_NAMES.dispatcher)))) return null;
      return {
        stage: "planner",
        requestFileName: STAGE_FILE_NAMES.planner,
        inputRef: `done/${DONE_FILE_NAMES.dispatcher}`,
        agent: "Spec Planner",
      };
    case "Bug Investigator":
      if (!(await exists(done(DONE_FILE_NAMES.dispatcher)))) return null;
      return {
        stage: "bug-investigator",
        requestFileName: STAGE_FILE_NAMES.bugInvestigator,
        inputRef: `done/${DONE_FILE_NAMES.dispatcher}`,
        agent: "Bug Investigator",
      };
    case "Feature Builder":
      if (await exists(done(DONE_FILE_NAMES.bugInvestigator))) {
        return {
          stage: "builder",
          requestFileName: STAGE_FILE_NAMES.builder,
          inputRef: `done/${DONE_FILE_NAMES.bugInvestigator}`,
          agent: "Feature Builder",
        };
      }
      if (await exists(done(DONE_FILE_NAMES.planner))) {
        return {
          stage: "builder",
          requestFileName: STAGE_FILE_NAMES.builder,
          inputRef: `done/${DONE_FILE_NAMES.planner}`,
          agent: "Feature Builder",
        };
      }
      return null;
    case "Reviewer":
      if (!(await exists(done(DONE_FILE_NAMES.builder)))) return null;
      return {
        stage: "reviewer",
        requestFileName: STAGE_FILE_NAMES.reviewer,
        inputRef: `done/${DONE_FILE_NAMES.builder}`,
        agent: "Reviewer",
      };
    case "QA Validator":
      if (!(await exists(done(DONE_FILE_NAMES.reviewer)))) return null;
      return {
        stage: "qa",
        requestFileName: STAGE_FILE_NAMES.qa,
        inputRef: `done/${DONE_FILE_NAMES.reviewer}`,
        agent: "QA Validator",
      };
    case "PR Writer":
      if (!(await exists(done(DONE_FILE_NAMES.qa)))) return null;
      return {
        stage: "pr",
        requestFileName: STAGE_FILE_NAMES.pr,
        inputRef: `done/${DONE_FILE_NAMES.qa}`,
        agent: "PR Writer",
      };
    default:
      return null;
  }
}

async function listFilesIfExists(dirPath: string): Promise<string[]> {
  if (!(await exists(dirPath))) return [];
  return listFiles(dirPath);
}

export async function acquireLock(lockName: string): Promise<boolean> {
  const filePath = path.join(locksDir(), lockName);
  await ensureDir(path.dirname(filePath));
  try {
    await fs.writeFile(filePath, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }), { flag: "wx" });
    return true;
  } catch {
    return false;
  }
}

export async function releaseLock(lockName: string): Promise<void> {
  const filePath = path.join(locksDir(), lockName);
  if (await exists(filePath)) await fs.unlink(filePath);
}

export async function detectStaleLocks(): Promise<StaleLockResult[]> {
  const stale = await collectStaleLocks();
  return stale.map((item) => item.result);
}

export async function clearStaleLocks(): Promise<StaleLockResult[]> {
  const stale = await collectStaleLocks();
  const cleared: StaleLockResult[] = [];

  for (const entry of stale) {
    await fs.unlink(entry.filePath).catch(() => undefined);
    cleared.push(entry.result);
  }

  return cleared;
}

export async function detectWorkingOrphans(): Promise<WorkingRecoveryResult[]> {
  const tasksRoot = tasksDir();
  if (!(await exists(tasksRoot))) return [];

  const taskIds = await listDirectories(tasksRoot);
  const findings: WorkingRecoveryResult[] = [];

  for (const taskId of taskIds) {
    const workingDir = path.join(tasksRoot, taskId, "working");
    const inboxDir = path.join(tasksRoot, taskId, "inbox");
    if (!(await exists(workingDir))) continue;

    const files = await listFiles(workingDir);
    for (const file of files) {
      const requestFile = WORKING_TO_REQUEST_FILE[file];
      if (!requestFile) {
        findings.push({
          taskId,
          file,
          action: "moved_to_failed",
          reason: "Unknown working file pattern",
        });
        continue;
      }

      const inboxTarget = path.join(inboxDir, requestFile);
      const hasDuplicateRequest = await exists(inboxTarget);
      findings.push({
        taskId,
        file,
        action: hasDuplicateRequest ? "moved_to_failed" : "requeued",
        reason: hasDuplicateRequest ? "A request file already exists in inbox" : "Interrupted task will be requeued",
      });
    }
  }

  return findings;
}

export async function recoverWorkingFiles(): Promise<WorkingRecoveryResult[]> {
  const tasksRoot = tasksDir();
  if (!(await exists(tasksRoot))) return [];

  const taskIds = await listDirectories(tasksRoot);
  const recovered: WorkingRecoveryResult[] = [];

  for (const taskId of taskIds) {
    const workingDir = path.join(tasksRoot, taskId, "working");
    const inboxDir = path.join(tasksRoot, taskId, "inbox");
    const failedDir = path.join(tasksRoot, taskId, "failed");
    if (!(await exists(workingDir))) continue;

    const files = await listFiles(workingDir);
    for (const file of files) {
      const requestFile = WORKING_TO_REQUEST_FILE[file];
      const from = path.join(workingDir, file);

      if (!requestFile) {
        const fallbackName = `${file}.orphaned-${Date.now()}.json`;
        await moveFile(from, path.join(failedDir, fallbackName));
        recovered.push({
          taskId,
          file,
          action: "moved_to_failed",
          reason: "Unknown working file pattern",
        });
        continue;
      }

      const inboxTarget = path.join(inboxDir, requestFile);
      if (await exists(inboxTarget)) {
        const fallbackName = `${file}.duplicate-${Date.now()}.json`;
        await moveFile(from, path.join(failedDir, fallbackName));
        recovered.push({
          taskId,
          file,
          action: "moved_to_failed",
          reason: "A request file already existed in inbox",
        });
      } else {
        await moveFile(from, inboxTarget);
        recovered.push({
          taskId,
          file,
          action: "requeued",
          reason: "Moved back to inbox",
        });
      }
    }
  }

  return recovered;
}

export async function detectInterruptedTasks(): Promise<InterruptedTaskRecoveryResult[]> {
  const root = tasksDir();
  if (!(await exists(root))) return [];

  const taskIds = await listDirectories(root);
  const findings: InterruptedTaskRecoveryResult[] = [];

  for (const taskId of taskIds) {
    const meta = await loadTaskMeta(taskId);
    if (["done", "failed", "archived", "waiting_human"].includes(meta.status)) continue;

    const inboxFiles = await listFilesIfExists(path.join(root, taskId, "inbox"));
    const workingFiles = await listFilesIfExists(path.join(root, taskId, "working"));
    if (inboxFiles.length || workingFiles.length) continue;

    const nextAgent = meta.nextAgent || (meta.status === "new" ? "Dispatcher" : "");
    if (!nextAgent) {
      findings.push({
        taskId,
        action: "skipped",
        reason: "No next agent is available in task metadata",
      });
      continue;
    }

    const nextRequest = await inferNextRequest(taskId, nextAgent as AgentName);
    if (!nextRequest) {
      findings.push({
        taskId,
        action: "skipped",
        reason: `Could not infer a safe request file for next agent ${nextAgent}`,
      });
      continue;
    }

    findings.push({
      taskId,
      action: "requeued",
      reason: `Task can be safely requeued for ${nextRequest.agent}`,
      requestFile: nextRequest.requestFileName,
    });
  }

  return findings;
}

export async function recoverInterruptedTasks(): Promise<InterruptedTaskRecoveryResult[]> {
  const root = tasksDir();
  if (!(await exists(root))) return [];

  const taskIds = await listDirectories(root);
  const recovered: InterruptedTaskRecoveryResult[] = [];

  for (const taskId of taskIds) {
    const meta = await loadTaskMeta(taskId);
    if (["done", "failed", "archived", "waiting_human"].includes(meta.status)) continue;

    const inboxPath = path.join(root, taskId, "inbox");
    const workingPath = path.join(root, taskId, "working");
    const inboxFiles = await listFilesIfExists(inboxPath);
    const workingFiles = await listFilesIfExists(workingPath);
    if (inboxFiles.length || workingFiles.length) continue;

    const nextAgent = meta.nextAgent || (meta.status === "new" ? "Dispatcher" : "");
    if (!nextAgent) {
      recovered.push({
        taskId,
        action: "skipped",
        reason: "No next agent is available in task metadata",
      });
      continue;
    }

    const nextRequest = await inferNextRequest(taskId, nextAgent as AgentName);
    if (!nextRequest) {
      recovered.push({
        taskId,
        action: "skipped",
        reason: `Could not infer a safe request file for next agent ${nextAgent}`,
      });
      continue;
    }

    const inboxTarget = path.join(inboxPath, nextRequest.requestFileName);
    if (!(await exists(inboxTarget))) {
      await writeJson(inboxTarget, {
        taskId,
        stage: nextRequest.stage,
        status: "request",
        createdAt: nowIso(),
        agent: nextRequest.agent,
        inputRef: nextRequest.inputRef,
      } satisfies StageEnvelope);
    }

    meta.status = "waiting_agent";
    meta.currentAgent = "";
    meta.nextAgent = nextRequest.agent;
    await saveTaskMeta(taskId, meta);

    recovered.push({
      taskId,
      action: "requeued",
      reason: `Recreated inbox request for ${nextRequest.agent}`,
      requestFile: nextRequest.requestFileName,
    });
  }

  return recovered;
}
