import path from "node:path";
import { appendText, writeJson } from "./fs.js";
import { logsDir } from "./paths.js";
import type { AgentName, TimingEntry } from "./types.js";
import { nowIso } from "./utils.js";

export async function logDaemon(message: string): Promise<void> {
  await appendText(path.join(logsDir(), "daemon.log"), `[${nowIso()}] ${message}\n`);
}

export async function logTaskEvent(taskPath: string, message: string): Promise<void> {
  await appendText(path.join(taskPath, "logs", "events.log"), `[${nowIso()}] ${message}\n`);
}

export async function logTiming(taskPath: string, entry: TimingEntry): Promise<void> {
  const line = JSON.stringify(entry) + "\n";
  await appendText(path.join(taskPath, "logs", "timings.jsonl"), line);
  await appendText(path.join(logsDir(), "stage-metrics.jsonl"), line);
}

export async function writeDaemonState(state: unknown): Promise<void> {
  await writeJson(path.join(logsDir(), "..", "runtime", "daemon-state.json"), state);
}

type AgentAuditEvent = "stage_started" | "stage_finished" | "stage_failed" | "handoff_queued" | "stage_note";

export interface AgentAuditEntry {
  at?: string;
  taskId: string;
  stage: string;
  agent: AgentName;
  event: AgentAuditEvent;
  inputRef?: string;
  nextAgent?: AgentName | "";
  nextStage?: string;
  durationMs?: number;
  status?: string;
  error?: string;
  output?: unknown;
  note?: string;
}

function normalizeAgentSlug(agent: AgentName): string {
  return agent.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function trimText(value: string, maxChars = 200): string {
  const next = value.trim();
  if (next.length <= maxChars) return next;
  return `${next.slice(0, Math.max(0, maxChars - 1))}…`;
}

function summarizeOutput(output: unknown): Record<string, unknown> {
  if (!output || typeof output !== "object" || Array.isArray(output)) return {};
  const row = output as Record<string, unknown>;
  const keys = Object.keys(row);
  const summary: Record<string, unknown> = {
    keys: keys.slice(0, 12),
  };

  const scalarFields = [
    "nextAgent",
    "verdict",
    "summary",
    "implementationSummary",
    "symptomSummary",
    "technicalContext",
    "strategy",
    "retryReason",
    "failureHypothesis",
    "changedFromPrevious",
    "successCriteria",
    "abandonCriteria",
    "retryAbortReason",
    "reason",
  ];
  for (const field of scalarFields) {
    if (typeof row[field] === "string" && row[field]) {
      summary[field] = trimText(String(row[field]), field === "summary" ? 280 : 180);
    }
  }

  const listFields = [
    "filesChanged",
    "changesMade",
    "testsToRun",
    "failures",
    "issuesFound",
    "requiredChanges",
    "suspectFiles",
    "filesReviewed",
    "recommendedChecks",
  ];
  for (const field of listFields) {
    if (Array.isArray(row[field])) {
      const values = row[field].filter((x): x is string => typeof x === "string");
      summary[`${field}Count`] = values.length;
      if (values.length) summary[field] = values.slice(0, 3).map((x) => trimText(x, 120));
    }
  }

  const numericFields = [
    "scopeFiles",
    "blockingFailures",
    "outOfScopeFailures",
    "cheapChecksExecuted",
    "heavyChecksExecuted",
    "heavyChecksSkipped",
    "fullBuildChecksExecuted",
    "earlyInScopeFailures",
    "plannedChecks",
    "executedChecks",
    "attempt",
    "attempts",
    "maxAttempts",
    "signatureAttempts",
    "blockingFailuresBefore",
    "blockingFailuresAfter",
    "noProgressStreak",
    "retryDurationMs",
    "retryAttempts",
    "retryProductive",
    "retryUnproductive",
    "retryRepeatedStrategy",
    "retryAdditionalTimeMs",
  ];
  for (const field of numericFields) {
    if (typeof row[field] === "number" && Number.isFinite(row[field])) {
      summary[field] = row[field];
    }
  }

  if (row.metrics && typeof row.metrics === "object" && !Array.isArray(row.metrics)) {
    const metrics = row.metrics as Record<string, unknown>;
    summary.metrics = {
      plannedChecks: typeof metrics.plannedChecks === "number" ? metrics.plannedChecks : 0,
      executedChecks: typeof metrics.executedChecks === "number" ? metrics.executedChecks : 0,
      cheapChecksExecuted: typeof metrics.cheapChecksExecuted === "number" ? metrics.cheapChecksExecuted : 0,
      heavyChecksExecuted: typeof metrics.heavyChecksExecuted === "number" ? metrics.heavyChecksExecuted : 0,
      heavyChecksSkipped: typeof metrics.heavyChecksSkipped === "number" ? metrics.heavyChecksSkipped : 0,
      fullBuildChecksExecuted: typeof metrics.fullBuildChecksExecuted === "number" ? metrics.fullBuildChecksExecuted : 0,
      earlyInScopeFailures: typeof metrics.earlyInScopeFailures === "number" ? metrics.earlyInScopeFailures : 0,
    };
  }

  const booleanFields = [
    "strategyChanged",
    "progressed",
    "sameSignatureAfter",
    "retryAbortedEarly",
  ];
  for (const field of booleanFields) {
    if (typeof row[field] === "boolean") {
      summary[field] = row[field];
    }
  }

  if (Array.isArray(row.executedChecks)) {
    const checks = row.executedChecks
      .filter((item): item is { command?: unknown; status?: unknown; exitCode?: unknown } => Boolean(item && typeof item === "object"))
      .map((item) => ({
        command: typeof item.command === "string" ? trimText(item.command, 140) : "[unknown]",
        status: typeof item.status === "string" ? item.status : "unknown",
        exitCode: typeof item.exitCode === "number" || item.exitCode === null ? item.exitCode : null,
      }));
    summary.executedChecks = checks.slice(0, 6);
  }

  if (row.riskAssessment && typeof row.riskAssessment === "object" && !Array.isArray(row.riskAssessment)) {
    const risk = row.riskAssessment as Record<string, unknown>;
    summary.riskAssessment = {
      buildRisk: typeof risk.buildRisk === "string" ? risk.buildRisk : "unknown",
      syntaxRisk: typeof risk.syntaxRisk === "string" ? risk.syntaxRisk : "unknown",
      logicRisk: typeof risk.logicRisk === "string" ? risk.logicRisk : "unknown",
      regressionRisk: typeof risk.regressionRisk === "string" ? risk.regressionRisk : "unknown",
    };
  }

  if (row.technicalRiskSummary && typeof row.technicalRiskSummary === "object" && !Array.isArray(row.technicalRiskSummary)) {
    const risk = row.technicalRiskSummary as Record<string, unknown>;
    summary.technicalRiskSummary = {
      buildRisk: typeof risk.buildRisk === "string" ? risk.buildRisk : "unknown",
      syntaxRisk: typeof risk.syntaxRisk === "string" ? risk.syntaxRisk : "unknown",
      logicRisk: typeof risk.logicRisk === "string" ? risk.logicRisk : "unknown",
      regressionRisk: typeof risk.regressionRisk === "string" ? risk.regressionRisk : "unknown",
    };
  }

  return summary;
}

export async function logAgentAudit(taskPath: string, entry: AgentAuditEntry): Promise<void> {
  const payload = {
    at: entry.at || nowIso(),
    taskId: entry.taskId,
    stage: entry.stage,
    agent: entry.agent,
    event: entry.event,
    inputRef: entry.inputRef || "",
    nextAgent: entry.nextAgent || "",
    nextStage: entry.nextStage || "",
    durationMs: typeof entry.durationMs === "number" ? entry.durationMs : undefined,
    status: entry.status || "",
    error: entry.error ? trimText(entry.error, 300) : "",
    note: entry.note ? trimText(entry.note, 180) : "",
    outputSummary: summarizeOutput(entry.output),
  };
  const line = JSON.stringify(payload) + "\n";
  await appendText(path.join(taskPath, "logs", "agent-audit.jsonl"), line);
  await appendText(path.join(logsDir(), "agent-audit", `${normalizeAgentSlug(entry.agent)}.jsonl`), line);
}
