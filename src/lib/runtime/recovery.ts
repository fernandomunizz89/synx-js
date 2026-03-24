import path from "node:path";
import { exists, listDirectories, listFiles, moveFile, writeJson } from "../fs.js";
import { taskDir, tasksDir } from "../paths.js";
import { DONE_FILE_NAMES, STAGE_FILE_NAMES } from "../constants.js";
import { loadTaskMeta, saveTaskMeta } from "../task.js";
import type { AgentName, StageEnvelope } from "../types.js";
import { nowIso } from "../utils.js";

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
  "00-project-orchestrator.working.json": STAGE_FILE_NAMES.projectOrchestrator,
  "00-dispatcher.working.json": STAGE_FILE_NAMES.dispatcher,
  "06-synx-qa-engineer.working.json": STAGE_FILE_NAMES.synxQaEngineer,
};

async function inferNextRequest(taskId: string, nextAgent: AgentName): Promise<NextStageRequest | null> {
  const done = (fileName: string) => path.join(taskDir(taskId), "done", fileName);

  switch (nextAgent) {
    case "Project Orchestrator":
      return {
        stage: "project-orchestrator",
        requestFileName: STAGE_FILE_NAMES.projectOrchestrator,
        inputRef: "input/new-task.json",
        agent: "Project Orchestrator",
      };
    case "Dispatcher":
      return {
        stage: "dispatcher",
        requestFileName: STAGE_FILE_NAMES.dispatcher,
        inputRef: "input/new-task.json",
        agent: "Dispatcher",
      };
    // Expert Squad – implementation agents
    case "Synx Front Expert":
      if (await exists(done(DONE_FILE_NAMES.synxQaEngineer))) {
        return {
          stage: "synx-front-expert",
          requestFileName: STAGE_FILE_NAMES.synxFrontExpert,
          inputRef: `done/${DONE_FILE_NAMES.synxQaEngineer}`,
          agent: "Synx Front Expert",
        };
      }
      if (!(await exists(done(DONE_FILE_NAMES.dispatcher)))) return null;
      return {
        stage: "synx-front-expert",
        requestFileName: STAGE_FILE_NAMES.synxFrontExpert,
        inputRef: `done/${DONE_FILE_NAMES.dispatcher}`,
        agent: "Synx Front Expert",
      };
    case "Synx Mobile Expert":
      if (await exists(done(DONE_FILE_NAMES.synxQaEngineer))) {
        return {
          stage: "synx-mobile-expert",
          requestFileName: STAGE_FILE_NAMES.synxMobileExpert,
          inputRef: `done/${DONE_FILE_NAMES.synxQaEngineer}`,
          agent: "Synx Mobile Expert",
        };
      }
      if (!(await exists(done(DONE_FILE_NAMES.dispatcher)))) return null;
      return {
        stage: "synx-mobile-expert",
        requestFileName: STAGE_FILE_NAMES.synxMobileExpert,
        inputRef: `done/${DONE_FILE_NAMES.dispatcher}`,
        agent: "Synx Mobile Expert",
      };
    case "Synx Back Expert":
      if (await exists(done(DONE_FILE_NAMES.synxQaEngineer))) {
        return {
          stage: "synx-back-expert",
          requestFileName: STAGE_FILE_NAMES.synxBackExpert,
          inputRef: `done/${DONE_FILE_NAMES.synxQaEngineer}`,
          agent: "Synx Back Expert",
        };
      }
      if (!(await exists(done(DONE_FILE_NAMES.dispatcher)))) return null;
      return {
        stage: "synx-back-expert",
        requestFileName: STAGE_FILE_NAMES.synxBackExpert,
        inputRef: `done/${DONE_FILE_NAMES.dispatcher}`,
        agent: "Synx Back Expert",
      };
    case "Synx SEO Specialist":
      if (!(await exists(done(DONE_FILE_NAMES.dispatcher)))) return null;
      return {
        stage: "synx-seo-specialist",
        requestFileName: STAGE_FILE_NAMES.synxSeoSpecialist,
        inputRef: `done/${DONE_FILE_NAMES.dispatcher}`,
        agent: "Synx SEO Specialist",
      };
    case "Synx QA Engineer":
      if (await exists(done(DONE_FILE_NAMES.synxFrontExpert))) {
        return {
          stage: "synx-qa-engineer",
          requestFileName: STAGE_FILE_NAMES.synxQaEngineer,
          inputRef: `done/${DONE_FILE_NAMES.synxFrontExpert}`,
          agent: "Synx QA Engineer",
        };
      }
      if (await exists(done(DONE_FILE_NAMES.synxMobileExpert))) {
        return {
          stage: "synx-qa-engineer",
          requestFileName: STAGE_FILE_NAMES.synxQaEngineer,
          inputRef: `done/${DONE_FILE_NAMES.synxMobileExpert}`,
          agent: "Synx QA Engineer",
        };
      }
      if (await exists(done(DONE_FILE_NAMES.synxBackExpert))) {
        return {
          stage: "synx-qa-engineer",
          requestFileName: STAGE_FILE_NAMES.synxQaEngineer,
          inputRef: `done/${DONE_FILE_NAMES.synxBackExpert}`,
          agent: "Synx QA Engineer",
        };
      }
      if (await exists(done(DONE_FILE_NAMES.synxSeoSpecialist))) {
        return {
          stage: "synx-qa-engineer",
          requestFileName: STAGE_FILE_NAMES.synxQaEngineer,
          inputRef: `done/${DONE_FILE_NAMES.synxSeoSpecialist}`,
          agent: "Synx QA Engineer",
        };
      }
      return null;
    default:
      return null;
  }
}

async function listFilesIfExists(dirPath: string): Promise<string[]> {
  if (!(await exists(dirPath))) return [];
  return listFiles(dirPath);
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

    const nextAgent = meta.nextAgent || (meta.status === "new"
      ? (meta.type === "Project" ? "Project Orchestrator" : "Dispatcher")
      : "");
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

    const nextAgent = meta.nextAgent || (meta.status === "new"
      ? (meta.type === "Project" ? "Project Orchestrator" : "Dispatcher")
      : "");
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
