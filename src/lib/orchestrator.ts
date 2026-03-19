import { logDaemon, logTaskEvent } from "./logging.js";
import { taskDir } from "./paths.js";
import { ARTIFACT_FILES, loadTaskArtifact, saveTaskArtifact } from "./task-artifacts.js";
import { trimText, unique } from "./text-utils.js";
import { ResearcherWorker, researchEnabled } from "../workers/web-researcher.js";
import {
  buildEntry,
  buildErrorSignature,
  deriveTriggerReasons,
  extractConfidenceSignal,
  loadResearchLog,
  formatResearchContextTag,
  matchLatestStageContext,
  normalizeRecommendation,
  resolveResearchBudgetPerStage,
  toContextPacket,
  withResearcherMeta,
  type ResearchContextPacket,
  type ResearchDecision,
  type ResearchLogArtifact,
  type ResearchRequest,
} from "./orchestration/research-orchestrator.js";

export {
  formatResearchContextTag,
  ResearchContextPacket,
  ResearchDecision,
  ResearchLogArtifact,
  ResearchRequest,
};

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
  const repeatedIssues = unique((request.repeatedIssues || []).map((item: string) => trimText(item, 220))).filter(Boolean);
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
