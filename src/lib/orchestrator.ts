import { logDaemon, logTaskEvent } from "./logging.js";
import { taskDir } from "./paths.js";
import { loadTaskMeta, saveTaskMeta } from "./task.js";
import { ARTIFACT_FILES, loadTaskArtifact, saveTaskArtifact } from "./task-artifacts.js";
import { envNumber } from "./env.js";
import { normalizeIssueLine, trimText, unique } from "./text-utils.js";
import { nowIso } from "./utils.js";
import type { AgentName, TaskType } from "./types.js";
import { ResearcherWorker, researchEnabled, type ResearchSource, type ResearcherKnowledgeOutput, type ResearcherRunArtifact } from "../workers/web-researcher.js";

export interface ResearchContextPacket {
  summary: string;
  sources: ResearchSource[];
  confidenceScore: number;
  recommendedAction: string;
  isBreakingChange: boolean;
  stage: string;
  requesterAgent: AgentName;
  triggerReasons: string[];
}

export interface ResearchRequest {
  taskId: string;
  stage: string;
  requesterAgent: AgentName;
  taskType: TaskType;
  previousStage: unknown | null;
  errorContext: string;
  targetTechnology: string;
  specificQuestion: string;
  repeatedIssues?: string[];
}

export interface ResearchDecision {
  status: "not_triggered" | "provided" | "budget_exhausted" | "abort_to_human";
  context: ResearchContextPacket | null;
  triggerReasons: string[];
  reusedContext: boolean;
  abortReason?: string;
}

interface ResearchLogEntry {
  id: string;
  createdAt: string;
  stage: string;
  requesterAgent: AgentName;
  taskType: TaskType;
  triggerReasons: string[];
  errorSignature: string;
  searchesUsed: number;
  queries: string[];
  output: ResearcherKnowledgeOutput;
  provider: string;
  model: string;
  repeatedRecommendationDetected: boolean;
}

interface ResearchLogArtifact {
  version: 1;
  entries: ResearchLogEntry[];
}

const EMPTY_RESEARCH_LOG: ResearchLogArtifact = {
  version: 1,
  entries: [],
};

function resolveResearchBudgetPerStage(): number {
  return envNumber("AI_AGENTS_RESEARCH_MAX_SEARCHES_PER_STAGE", 2, {
    integer: true,
    min: 1,
    max: 8,
  });
}

function getConfidenceSignal(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const candidates = [
    source.confidence,
    source.confidenceScore,
    source.confidence_score,
  ];
  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (!Number.isFinite(parsed)) continue;
    if (parsed < 0 || parsed > 1) continue;
    return parsed;
  }
  return null;
}

function extractConfidenceSignal(previousStage: unknown | null): number | null {
  if (!previousStage || typeof previousStage !== "object") return null;
  const stageEnvelope = previousStage as Record<string, unknown>;
  const direct = getConfidenceSignal(stageEnvelope);
  if (direct !== null) return direct;
  return getConfidenceSignal(stageEnvelope.output);
}

function normalizeTextForSignature(value: string): string {
  return normalizeIssueLine(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s:/._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildErrorSignature(args: { errorContext: string; specificQuestion: string; repeatedIssues: string[] }): string {
  const parts = unique([
    normalizeTextForSignature(args.errorContext),
    normalizeTextForSignature(args.specificQuestion),
    ...args.repeatedIssues.map((item) => normalizeTextForSignature(item)),
  ]).filter(Boolean);
  return parts.join(" | ").slice(0, 800);
}

function normalizeRecommendation(value: string): string {
  return normalizeTextForSignature(value).slice(0, 400);
}

function toContextPacket(args: {
  output: ResearcherKnowledgeOutput;
  stage: string;
  requesterAgent: AgentName;
  triggerReasons: string[];
}): ResearchContextPacket {
  return {
    summary: trimText(args.output.summary, 500),
    sources: args.output.sources.slice(0, 6),
    confidenceScore: Math.max(0, Math.min(1, Number(args.output.confidence_score) || 0.5)),
    recommendedAction: trimText(args.output.recommended_action, 500),
    isBreakingChange: Boolean(args.output.is_breaking_change),
    stage: args.stage,
    requesterAgent: args.requesterAgent,
    triggerReasons: args.triggerReasons,
  };
}

function sanitizeResearchLog(raw: unknown): ResearchLogArtifact {
  if (!raw || typeof raw !== "object") return { ...EMPTY_RESEARCH_LOG };
  const source = raw as { version?: unknown; entries?: unknown };
  if (source.version !== 1 || !Array.isArray(source.entries)) {
    return { ...EMPTY_RESEARCH_LOG };
  }

  const entries: ResearchLogEntry[] = [];
  for (const item of source.entries) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const output = row.output && typeof row.output === "object"
      ? row.output as Partial<ResearcherKnowledgeOutput>
      : null;
    if (!output) continue;

    const entry: ResearchLogEntry = {
      id: typeof row.id === "string" ? row.id : `${Date.now()}-${entries.length}`,
      createdAt: typeof row.createdAt === "string" ? row.createdAt : nowIso(),
      stage: typeof row.stage === "string" ? row.stage : "",
      requesterAgent: (typeof row.requesterAgent === "string" ? row.requesterAgent : "Researcher") as AgentName,
      taskType: (typeof row.taskType === "string" ? row.taskType : "Research") as TaskType,
      triggerReasons: Array.isArray(row.triggerReasons) ? row.triggerReasons.filter((x): x is string => typeof x === "string").slice(0, 5) : [],
      errorSignature: typeof row.errorSignature === "string" ? row.errorSignature : "",
      searchesUsed: Math.max(0, Number(row.searchesUsed) || 0),
      queries: Array.isArray(row.queries) ? row.queries.filter((x): x is string => typeof x === "string").slice(0, 5) : [],
      output: {
        summary: typeof output.summary === "string" ? output.summary : "",
        sources: Array.isArray(output.sources)
          ? output.sources
            .filter((sourceItem): sourceItem is ResearchSource => Boolean(sourceItem && typeof sourceItem === "object" && typeof (sourceItem as ResearchSource).title === "string" && typeof (sourceItem as ResearchSource).url === "string"))
            .slice(0, 6)
          : [],
        confidence_score: Math.max(0, Math.min(1, Number(output.confidence_score) || 0.5)),
        recommended_action: typeof output.recommended_action === "string" ? output.recommended_action : "",
        is_breaking_change: Boolean(output.is_breaking_change),
      },
      provider: typeof row.provider === "string" ? row.provider : "",
      model: typeof row.model === "string" ? row.model : "",
      repeatedRecommendationDetected: Boolean(row.repeatedRecommendationDetected),
    };

    if (!entry.stage) continue;
    entries.push(entry);
  }

  return {
    version: 1,
    entries,
  };
}

async function loadResearchLog(taskId: string): Promise<ResearchLogArtifact> {
  const raw = await loadTaskArtifact<unknown>(taskId, ARTIFACT_FILES.researchLog);
  return sanitizeResearchLog(raw);
}

async function withResearcherMeta(taskId: string, stage: string, run: () => Promise<ResearcherRunArtifact>): Promise<ResearcherRunArtifact> {
  const before = await loadTaskMeta(taskId);
  const restore = {
    currentAgent: before.currentAgent,
    currentStage: before.currentStage,
    status: before.status,
    nextAgent: before.nextAgent,
    humanApprovalRequired: before.humanApprovalRequired,
  };

  before.currentAgent = "Dispatcher";  // Temporary identity during research sub-invocation
  before.currentStage = `${stage}:research`;
  before.status = "in_progress";
  await saveTaskMeta(taskId, before);

  try {
    return await run();
  } finally {
    const after = await loadTaskMeta(taskId);
    after.currentAgent = restore.currentAgent;
    after.currentStage = restore.currentStage;
    after.status = restore.status;
    after.nextAgent = restore.nextAgent;
    after.humanApprovalRequired = restore.humanApprovalRequired;
    await saveTaskMeta(taskId, after);
  }
}

function matchLatestStageContext(
  latest: ResearchContextPacket | null,
  stage: string,
  requesterAgent: AgentName,
): ResearchContextPacket | null {
  if (!latest) return null;
  if (latest.stage !== stage) return null;
  if (latest.requesterAgent !== requesterAgent) return null;
  return latest;
}

function deriveTriggerReasons(args: { confidence: number | null; repeatedIssues: string[] }): string[] {
  const reasons: string[] = [];
  if (typeof args.confidence === "number" && args.confidence < 0.6) {
    reasons.push(`low_confidence:${args.confidence.toFixed(2)}`);
  }
  if (args.repeatedIssues.length > 0) {
    reasons.push("qa_same_error_second_consecutive");
  }
  return reasons;
}

function buildEntry(args: {
  artifact: ResearcherRunArtifact;
  request: ResearchRequest;
  triggerReasons: string[];
  errorSignature: string;
  repeatedRecommendationDetected: boolean;
}): ResearchLogEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    createdAt: nowIso(),
    stage: args.request.stage,
    requesterAgent: args.request.requesterAgent,
    taskType: args.request.taskType,
    triggerReasons: args.triggerReasons,
    errorSignature: args.errorSignature,
    searchesUsed: args.artifact.searchesUsed,
    queries: args.artifact.queries,
    output: args.artifact.output,
    provider: args.artifact.provider,
    model: args.artifact.model,
    repeatedRecommendationDetected: args.repeatedRecommendationDetected,
  };
}

export function formatResearchContextTag(context: ResearchContextPacket): string {
  const lines: string[] = [];
  lines.push(`Summary: ${context.summary}`);
  lines.push(`Recommended action: ${context.recommendedAction}`);
  lines.push(`Confidence: ${context.confidenceScore.toFixed(2)}`);
  lines.push(`Breaking change risk: ${context.isBreakingChange ? "yes" : "no"}`);
  if (context.sources.length) {
    lines.push("Sources:");
    for (const source of context.sources.slice(0, 5)) {
      lines.push(`- ${source.title} | ${source.url}`);
    }
  }
  return lines.join("\n");
}

export async function requestResearchContext(request: ResearchRequest): Promise<ResearchDecision> {
  if (!researchEnabled()) {
    return {
      status: "not_triggered",
      context: null,
      triggerReasons: [],
      reusedContext: false,
    };
  }

  const confidence = extractConfidenceSignal(request.previousStage);
  const repeatedIssues = unique((request.repeatedIssues || []).map((item) => trimText(item, 220))).filter(Boolean);
  const triggerReasons = deriveTriggerReasons({ confidence, repeatedIssues });
  if (!triggerReasons.length) {
    return {
      status: "not_triggered",
      context: null,
      triggerReasons: [],
      reusedContext: false,
    };
  }

  const log = await loadResearchLog(request.taskId);
  const latestContext = await loadTaskArtifact<ResearchContextPacket>(request.taskId, ARTIFACT_FILES.researchContext);
  const matchingLatest = matchLatestStageContext(latestContext, request.stage, request.requesterAgent);

  const stageEntries = log.entries.filter((entry) => entry.stage === request.stage);
  const stageSearchesUsed = stageEntries.reduce((sum, entry) => sum + Math.max(0, entry.searchesUsed), 0);
  const searchBudget = resolveResearchBudgetPerStage();
  const remainingSearches = Math.max(0, searchBudget - stageSearchesUsed);

  if (remainingSearches <= 0) {
    const budgetMessage = `Research budget exhausted for stage ${request.stage} (${stageSearchesUsed}/${searchBudget} searches used).`;
    await logTaskEvent(taskDir(request.taskId), budgetMessage);
    await logDaemon(`Researcher skipped for ${request.taskId}: ${budgetMessage}`);

    if (matchingLatest) {
      return {
        status: "provided",
        context: matchingLatest,
        triggerReasons,
        reusedContext: true,
      };
    }

    return {
      status: "budget_exhausted",
      context: null,
      triggerReasons,
      reusedContext: false,
      abortReason: budgetMessage,
    };
  }

  const errorSignature = buildErrorSignature({
    errorContext: request.errorContext,
    specificQuestion: request.specificQuestion,
    repeatedIssues,
  });

  const researcher = new ResearcherWorker();
  await logTaskEvent(taskDir(request.taskId), `🌐 Searching Web... (${request.stage})`);
  await logDaemon(`Researcher started for ${request.taskId} (${request.stage}).`);

  const artifact = await withResearcherMeta(request.taskId, request.stage, () => researcher.run({
    taskId: request.taskId,
    stage: request.stage,
    requesterAgent: request.requesterAgent,
    taskType: request.taskType,
    errorContext: request.errorContext,
    targetTechnology: request.targetTechnology,
    specificQuestion: request.specificQuestion,
    maxSearches: Math.min(2, remainingSearches),
  }));

  const priorSameSignature = stageEntries
    .filter((entry) => entry.errorSignature && entry.errorSignature === errorSignature)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const latestPrior = priorSameSignature.length ? priorSameSignature[priorSameSignature.length - 1] : null;
  const repeatedRecommendationDetected = Boolean(
    latestPrior
      && normalizeRecommendation(latestPrior.output.recommended_action)
      && normalizeRecommendation(latestPrior.output.recommended_action) === normalizeRecommendation(artifact.output.recommended_action),
  );

  const entry = buildEntry({
    artifact,
    request,
    triggerReasons,
    errorSignature,
    repeatedRecommendationDetected,
  });

  const nextLog: ResearchLogArtifact = {
    version: 1,
    entries: [...log.entries, entry].slice(-50),
  };
  await saveTaskArtifact(request.taskId, ARTIFACT_FILES.researchLog, nextLog);

  const context = toContextPacket({
    output: artifact.output,
    stage: request.stage,
    requesterAgent: request.requesterAgent,
    triggerReasons,
  });
  await saveTaskArtifact(request.taskId, ARTIFACT_FILES.researchContext, context);
  await logTaskEvent(taskDir(request.taskId), `Researcher completed (${artifact.searchesUsed} search${artifact.searchesUsed === 1 ? "" : "es"}).`);

  if (repeatedRecommendationDetected && repeatedIssues.length > 0) {
    const reason = "Researcher returned the same recommendation while the same QA issue persists. Escalating to human review.";
    await logTaskEvent(taskDir(request.taskId), reason);
    await logDaemon(`Research anti-loop triggered for ${request.taskId}: ${reason}`);

    return {
      status: "abort_to_human",
      context,
      triggerReasons,
      reusedContext: false,
      abortReason: reason,
    };
  }

  return {
    status: "provided",
    context,
    triggerReasons,
    reusedContext: false,
  };
}
