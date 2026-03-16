import path from "node:path";
import { promises as fs } from "node:fs";
import { exists, moveFile, readJsonValidated, writeJson } from "../lib/fs.js";
import { logAgentAudit, logDaemon, logQueueLatency, logTaskEvent, logTiming } from "../lib/logging.js";
import { taskDir } from "../lib/paths.js";
import { acquireLock, releaseLock } from "../lib/runtime.js";
import { loadTaskMeta, saveTaskMeta } from "../lib/task.js";
import { providerErrorToHuman } from "../lib/human-messages.js";
import { extractProviderErrorMeta } from "../lib/provider-error-meta.js";
import type { AgentName, NewTaskInput, StageEnvelope, TimingEntry } from "../lib/types.js";
import { nowIso, sleep } from "../lib/utils.js";
import { newTaskInputSchema, stageEnvelopeSchema } from "../lib/schema.js";

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
      const request = await readJsonValidated(workingFile, stageEnvelopeSchema);
      const stageStartAt = nowIso();
      const requestCreatedAt = typeof request.createdAt === "string" ? request.createdAt : "";
      const requestCreatedAtMs = requestCreatedAt ? new Date(requestCreatedAt).getTime() : Number.NaN;
      const stageStartAtMs = new Date(stageStartAt).getTime();
      const queueLatencyMs = Number.isFinite(requestCreatedAtMs) && Number.isFinite(stageStartAtMs) && stageStartAtMs >= requestCreatedAtMs
        ? stageStartAtMs - requestCreatedAtMs
        : -1;

      const meta = await loadTaskMeta(taskId);
      meta.status = "in_progress";
      meta.currentAgent = this.agent;
      meta.currentStage = request.stage;
      await saveTaskMeta(taskId, meta);

      await logDaemon(`${this.agent} started ${request.stage} for ${taskId}`);
      await logTaskEvent(
        taskPath,
        queueLatencyMs >= 0
          ? `${this.agent} started ${request.stage} | queue wait ${queueLatencyMs}ms`
          : `${this.agent} started ${request.stage}`,
      );
      if (queueLatencyMs >= 0 && requestCreatedAt) {
        await logQueueLatency({
          taskId,
          stage: request.stage,
          agent: this.agent,
          requestCreatedAt,
          startedAt: stageStartAt,
          queueLatencyMs,
        });
      }
      await logAgentAudit(taskPath, {
        taskId,
        stage: request.stage,
        agent: this.agent,
        event: "stage_started",
        inputRef: request.inputRef,
        status: "in_progress",
        output: queueLatencyMs >= 0 ? {
          queueLatencyMs,
          requestCreatedAt,
        } : {},
      });

      startedAt = stageStartAt;
      await this.processTask(taskId, request);
      await fs.unlink(workingFile).catch(() => undefined);
      return true;
    } catch (error) {
      const endedAt = nowIso();
      const durationMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
      const errorMeta = extractProviderErrorMeta(error);
      const parseRetries = errorMeta.parseRetries;
      const parseRetryAdditionalDurationMs = errorMeta.parseRetryAdditionalDurationMs;
      const parseFailureReasons = errorMeta.parseFailureReasons;
      const providerAttempts = errorMeta.providerAttempts;
      const providerBackoffRetries = errorMeta.providerBackoffRetries;
      const providerBackoffWaitMs = errorMeta.providerBackoffWaitMs;
      const providerRateLimitWaitMs = errorMeta.providerRateLimitWaitMs;
      const providerThrottleReasons = errorMeta.providerThrottleReasons;
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
        parseRetries,
        validationPassed: false,
        providerAttempts,
        providerBackoffRetries,
        providerBackoffWaitMs,
        providerRateLimitWaitMs,
      };
      await logTiming(taskPath, timing);

      const humanMessage = providerErrorToHuman(error instanceof Error ? error.message : String(error));
      if (parseRetries > 0) {
        await logTaskEvent(
          taskPath,
          `${this.agent} parsing retries used before failure: ${parseRetries} (extra ${parseRetryAdditionalDurationMs}ms)${parseFailureReasons.length ? ` | reasons: ${parseFailureReasons.join(" | ")}` : ""}`,
        );
      }
      if (providerBackoffRetries > 0 || providerRateLimitWaitMs > 0) {
        await logTaskEvent(
          taskPath,
          `${this.agent} provider control stats before failure: attempts=${providerAttempts} | backoff_retries=${providerBackoffRetries} | backoff_wait_ms=${providerBackoffWaitMs} | rate_limit_wait_ms=${providerRateLimitWaitMs}${providerThrottleReasons.length ? ` | reasons: ${providerThrottleReasons.join(" | ")}` : ""}`,
        );
      }
      await logTaskEvent(taskPath, `${this.agent} failed: ${humanMessage}`);
      await logDaemon(`${this.agent} failed for ${taskId}: ${humanMessage}`);
      await logAgentAudit(taskPath, {
        taskId,
        stage: this.workingFileName.replace(".working.json", ""),
        agent: this.agent,
        event: "stage_failed",
        status: "failed",
        durationMs,
        error: humanMessage,
        output: {
          parseRetries,
          parseRetryAdditionalDurationMs,
          parseFailureReasons,
          providerAttempts,
          providerBackoffRetries,
          providerBackoffWaitMs,
          providerRateLimitWaitMs,
          providerThrottleReasons,
        },
      });
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
    providerAttempts?: number;
    providerBackoffRetries?: number;
    providerBackoffWaitMs?: number;
    providerRateLimitWaitMs?: number;
    estimatedInputTokens?: number;
    estimatedOutputTokens?: number;
    estimatedTotalTokens?: number;
    estimatedCostUsd?: number;
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
      providerAttempts: args.providerAttempts,
      providerBackoffRetries: args.providerBackoffRetries,
      providerBackoffWaitMs: args.providerBackoffWaitMs,
      providerRateLimitWaitMs: args.providerRateLimitWaitMs,
      estimatedInputTokens: args.estimatedInputTokens,
      estimatedOutputTokens: args.estimatedOutputTokens,
      estimatedTotalTokens: args.estimatedTotalTokens,
      estimatedCostUsd: args.estimatedCostUsd,
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
      providerAttempts: args.providerAttempts,
      providerBackoffRetries: args.providerBackoffRetries,
      providerBackoffWaitMs: args.providerBackoffWaitMs,
      providerRateLimitWaitMs: args.providerRateLimitWaitMs,
      estimatedInputTokens: args.estimatedInputTokens,
      estimatedOutputTokens: args.estimatedOutputTokens,
      estimatedTotalTokens: args.estimatedTotalTokens,
      estimatedCostUsd: args.estimatedCostUsd,
    });
    await logTaskEvent(taskPath, `${this.agent} finished ${args.stage} in ${durationMs}ms`);
    await logDaemon(`${this.agent} finished ${args.stage} for ${args.taskId} in ${durationMs}ms`);
    await logAgentAudit(taskPath, {
      taskId: args.taskId,
      stage: args.stage,
      agent: this.agent,
      event: "stage_finished",
      durationMs,
      status: "done",
      nextAgent: args.nextAgent || "",
      nextStage: args.nextStage,
      output: args.output,
    });

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
      await logAgentAudit(taskPath, {
        taskId: args.taskId,
        stage: args.stage,
        agent: this.agent,
        event: "handoff_queued",
        status: "queued",
        nextAgent: args.nextAgent,
        nextStage: args.nextStage,
        inputRef: args.nextInputRef,
      });
    }
  }

  protected async fakeWork(minMs = 300, maxMs = 1100): Promise<void> {
    const duration = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    await sleep(duration);
  }

  protected async note(args: {
    taskId: string;
    stage: string;
    message: string;
    details?: Record<string, unknown>;
  }): Promise<void> {
    const taskPath = taskDir(args.taskId);
    await logTaskEvent(taskPath, `${this.agent} note ${args.stage}: ${args.message}`);
    await logAgentAudit(taskPath, {
      taskId: args.taskId,
      stage: args.stage,
      agent: this.agent,
      event: "stage_note",
      status: "note",
      note: args.message,
      output: args.details || {},
    });
  }

  protected async loadTaskInput(taskId: string): Promise<NewTaskInput> {
    return readJsonValidated(path.join(taskDir(taskId), "input", "new-task.json"), newTaskInputSchema);
  }

  protected async loadReferencedInput(taskId: string, request: StageEnvelope): Promise<unknown | null> {
    if (!request.inputRef) return null;
    const base = taskDir(taskId);
    const target = path.resolve(base, request.inputRef);
    if (!(target === base || target.startsWith(`${base}${path.sep}`))) {
      throw new Error(`Unsafe inputRef path detected: ${request.inputRef}`);
    }
    if (!(await exists(target))) {
      throw new Error(`Referenced input file not found: ${request.inputRef}`);
    }
    return readJsonValidated(target, stageEnvelopeSchema);
  }

  protected async buildAgentInput(taskId: string, request: StageEnvelope): Promise<{
    task: NewTaskInput;
    request: StageEnvelope;
    previousStage: unknown | null;
  }> {
    const [task, previousStage] = await Promise.all([
      this.loadTaskInput(taskId),
      this.loadReferencedInput(taskId, request),
    ]);

    return {
      task,
      request,
      previousStage,
    };
  }
}
