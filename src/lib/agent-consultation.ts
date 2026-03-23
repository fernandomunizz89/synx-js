import { z } from "zod";
import { ARTIFACT_FILES, loadTaskArtifact, saveTaskArtifact } from "./task-artifacts.js";
import type { AgentName, TaskType } from "./types.js";
import type { createProvider } from "../providers/factory.js";

export interface ConsultationRequest {
  taskId: string;
  stage: string;
  requesterAgent: string;
  consultantAgent: AgentName;
  question: string;
  context: string;
  taskType?: TaskType;
}

export interface ConsultationDecision {
  status: "provided" | "budget_exhausted" | "not_triggered" | "cached";
  answer: string | null;
  keyPoints: string[];
  confidence: number;
  consultantAgent: AgentName;
  triggerReasons: string[];
  reusedCache: boolean;
}

export interface ConsultationLogEntry {
  id: string;
  stage: string;
  requesterAgent: string;
  consultantAgent: string;
  question: string;
  questionNormalized: string;
  answer: string;
  keyPoints: string[];
  confidence: number;
  createdAt: string;
}

export interface ConsultationLogArtifact {
  version: 1;
  entries: ConsultationLogEntry[];
}

const MAX_CONSULTATIONS_PER_PAIR = 3;
const MIN_QUESTION_LENGTH = 30;

const consultationOutputSchema = z.object({
  answer: z.string(),
  keyPoints: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
});

function normalizeQuestion(question: string): string {
  return question.toLowerCase().trim();
}

async function loadConsultationLog(taskId: string): Promise<ConsultationLogArtifact> {
  const log = await loadTaskArtifact<ConsultationLogArtifact>(taskId, ARTIFACT_FILES.agentConsultationLog);
  if (log && log.version === 1 && Array.isArray(log.entries)) {
    return log;
  }
  return { version: 1, entries: [] };
}

async function saveConsultationLog(taskId: string, log: ConsultationLogArtifact): Promise<void> {
  await saveTaskArtifact(taskId, ARTIFACT_FILES.agentConsultationLog, log);
}

/**
 * Request an inline consultation from a specialist agent.
 *
 * - Returns "not_triggered" for trivial/short questions (< 30 chars).
 * - Returns "cached" if the same question was already answered by the same consultant for the same stage.
 * - Returns "budget_exhausted" after MAX_CONSULTATIONS_PER_PAIR consultations per (stage + consultantAgent) pair.
 * - Otherwise calls the consultant agent via providerFactory and returns "provided".
 */
export async function requestAgentConsultation(
  request: ConsultationRequest,
  providerFactory: (agent: AgentName) => ReturnType<typeof createProvider>,
): Promise<ConsultationDecision> {
  const { taskId, stage, requesterAgent, consultantAgent, question, context } = request;

  // Guard: trivial/short questions are not worth consulting on
  if (question.trim().length < MIN_QUESTION_LENGTH) {
    return {
      status: "not_triggered",
      answer: null,
      keyPoints: [],
      confidence: 0,
      consultantAgent,
      triggerReasons: ["question_too_short"],
      reusedCache: false,
    };
  }

  const log = await loadConsultationLog(taskId);
  const questionNormalized = normalizeQuestion(question);

  // Check for cached response (same stage + consultant + normalized question)
  const cached = log.entries.find(
    (e) =>
      e.stage === stage &&
      e.consultantAgent === consultantAgent &&
      e.questionNormalized === questionNormalized,
  );

  if (cached) {
    return {
      status: "cached",
      answer: cached.answer,
      keyPoints: cached.keyPoints,
      confidence: cached.confidence,
      consultantAgent,
      triggerReasons: ["cache_hit"],
      reusedCache: true,
    };
  }

  // Check budget: count existing entries for this (stage, consultantAgent) pair
  const pairEntries = log.entries.filter(
    (e) => e.stage === stage && e.consultantAgent === consultantAgent,
  );

  if (pairEntries.length >= MAX_CONSULTATIONS_PER_PAIR) {
    return {
      status: "budget_exhausted",
      answer: null,
      keyPoints: [],
      confidence: 0,
      consultantAgent,
      triggerReasons: ["budget_exhausted"],
      reusedCache: false,
    };
  }

  // Call the consultant agent via the injected provider factory
  const provider = providerFactory(consultantAgent);

  const systemPrompt = [
    `You are ${consultantAgent}, a domain specialist.`,
    `A colleague (${requesterAgent}) asks you the following question.`,
    "",
    `QUESTION: ${question}`,
    "",
    `CONTEXT:`,
    context,
    "",
    "Provide a concise, expert answer. Return JSON with: answer (string), keyPoints (string[]), confidence (0-1).",
  ].join("\n");

  const result = await provider.generateStructured({
    agent: consultantAgent,
    taskId,
    stage,
    systemPrompt,
    input: { question, context },
    expectedJsonSchemaDescription: '{ "answer": "string", "keyPoints": ["string"], "confidence": 0.9 }',
  });

  const parsed = consultationOutputSchema.parse(result.parsed);

  const entry: ConsultationLogEntry = {
    id: `${stage}-${consultantAgent}-${Date.now()}`,
    stage,
    requesterAgent,
    consultantAgent,
    question,
    questionNormalized,
    answer: parsed.answer,
    keyPoints: parsed.keyPoints,
    confidence: parsed.confidence,
    createdAt: new Date().toISOString(),
  };

  log.entries.push(entry);
  await saveConsultationLog(taskId, log);

  return {
    status: "provided",
    answer: parsed.answer,
    keyPoints: parsed.keyPoints,
    confidence: parsed.confidence,
    consultantAgent,
    triggerReasons: ["question_triggered"],
    reusedCache: false,
  };
}
