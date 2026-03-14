import path from "node:path";
import { promises as fs } from "node:fs";
import { exists, moveFile, readJson, writeJson } from "../lib/fs.js";
import { logDaemon, logTaskEvent, logTiming } from "../lib/logging.js";
import { taskDir } from "../lib/paths.js";
import { acquireLock, releaseLock } from "../lib/runtime.js";
import { loadTaskMeta, saveTaskMeta } from "../lib/task.js";
import { providerErrorToHuman } from "../lib/human-messages.js";
import type { AgentName, StageEnvelope, TimingEntry } from "../lib/types.js";
import { nowIso, sleep } from "../lib/utils.js";

export abstract class WorkerBase {
  abstract readonly agent: AgentName;
  abstract readonly requestFileName: string;
  abstract readonly workingFileName: string;
  protected abstract processTask(taskId: string, request: StageEnvelope): Promise<void>;

  async tryProcess(taskId: string): Promise<boolean> {
    const taskPath = taskDir(taskId);
    const inboxFile = path.join(taskPath, "inbox", this.requestFileName);
    if (!(await exists(inboxFile))) return false;

    const lockName = `${taskId}-${this.requestFileName}.lock`;
    if (!(await acquireLock(lockName))) return false;

    const workingFile = path.join(taskPath, "working", this.workingFileName);
    let startedAt = nowIso();

    try {
      await moveFile(inboxFile, workingFile);
      const request = await readJson<StageEnvelope>(workingFile);

      const meta = await loadTaskMeta(taskId);
      meta.status = "in_progress";
      meta.currentAgent = this.agent;
      meta.currentStage = request.stage;
      await saveTaskMeta(taskId, meta);

      await logDaemon(`${this.agent} started ${request.stage} for ${taskId}`);
      await logTaskEvent(taskPath, `${this.agent} started ${request.stage}`);

      startedAt = nowIso();
      await this.processTask(taskId, request);
      await fs.unlink(workingFile).catch(() => undefined);
      return true;
    } catch (error) {
      const endedAt = nowIso();
      const durationMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
      const meta = await loadTaskMeta(taskId);
      meta.status = "failed";
      meta.currentAgent = this.agent;
      await saveTaskMeta(taskId, meta);

      const timing: TimingEntry = {
        taskId,
        stage: this.workingFileName.replace(".working.json", ""),
        agent: this.agent,
        startedAt,
        endedAt,
        durationMs,
        status: "failed",
        parseRetries: 0,
        validationPassed: false,
      };
      await logTiming(taskPath, timing);

      const humanMessage = providerErrorToHuman(error instanceof Error ? error.message : String(error));
      await logTaskEvent(taskPath, `${this.agent} failed: ${humanMessage}`);
      await logDaemon(`${this.agent} failed for ${taskId}: ${humanMessage}`);
      await fs.unlink(workingFile).catch(() => undefined);
      return false;
    } finally {
      await releaseLock(lockName);
    }
  }

  protected async finishStage(args: {
    taskId: string;
    stage: string;
    doneFileName: string;
    viewFileName: string;
    viewContent: string;
    output: unknown;
    nextAgent?: AgentName;
    nextStage?: string;
    nextRequestFileName?: string;
    nextInputRef?: string;
    humanApprovalRequired?: boolean;
    startedAt: string;
    provider?: string;
    model?: string;
    parseRetries?: number;
    validationPassed?: boolean;
  }): Promise<void> {
    const taskPath = taskDir(args.taskId);
    const endedAt = nowIso();
    const durationMs = new Date(endedAt).getTime() - new Date(args.startedAt).getTime();

    const envelope: StageEnvelope = {
      taskId: args.taskId,
      stage: args.stage,
      status: "done",
      createdAt: endedAt,
      agent: this.agent,
      output: args.output,
    };

    await writeJson(path.join(taskPath, "done", args.doneFileName), envelope);
    await writeJson(path.join(taskPath, "views", args.viewFileName.replace(".md", ".json")), envelope);
    await fs.writeFile(path.join(taskPath, "views", args.viewFileName), args.viewContent, "utf8");

    const meta = await loadTaskMeta(args.taskId);
    meta.history.push({
      stage: args.stage,
      agent: this.agent,
      startedAt: args.startedAt,
      endedAt,
      durationMs,
      status: "done",
      provider: args.provider,
      model: args.model,
      parseRetries: args.parseRetries,
      validationPassed: args.validationPassed,
    });
    meta.currentStage = args.stage;
    meta.currentAgent = this.agent;
    meta.nextAgent = args.nextAgent ?? "";
    meta.humanApprovalRequired = args.humanApprovalRequired ?? false;
    meta.status = args.humanApprovalRequired ? "waiting_human" : args.nextAgent ? "waiting_agent" : "in_progress";
    await saveTaskMeta(args.taskId, meta);

    await logTiming(taskPath, {
      taskId: args.taskId,
      stage: args.stage,
      agent: this.agent,
      provider: args.provider,
      model: args.model,
      startedAt: args.startedAt,
      endedAt,
      durationMs,
      status: "done",
      parseRetries: args.parseRetries,
      validationPassed: args.validationPassed,
    });
    await logTaskEvent(taskPath, `${this.agent} finished ${args.stage} in ${durationMs}ms`);
    await logDaemon(`${this.agent} finished ${args.stage} for ${args.taskId} in ${durationMs}ms`);

    if (args.nextAgent && args.nextStage && args.nextRequestFileName && args.nextInputRef) {
      await writeJson(path.join(taskPath, "inbox", args.nextRequestFileName), {
        taskId: args.taskId,
        stage: args.nextStage,
        status: "request",
        createdAt: nowIso(),
        agent: args.nextAgent,
        inputRef: args.nextInputRef,
      } satisfies StageEnvelope);

      await logTaskEvent(taskPath, `Queued next stage ${args.nextStage} for ${args.nextAgent}`);
    }
  }

  protected async fakeWork(minMs = 300, maxMs = 1100): Promise<void> {
    const duration = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    await sleep(duration);
  }
}
