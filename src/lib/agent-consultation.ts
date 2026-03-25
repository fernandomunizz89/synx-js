/**
 * Phase 4.2 — Agent Consultation
 *
 * Allows expert agents to consult a specialist during task processing.
 * Produces a structured answer without creating a new pipeline stage.
 */
import { loadResolvedProjectConfig, resolveProviderConfigForAgent, loadPromptFile } from "./config.js";
import { buildAgentRoleContract } from "./agent-role-contract.js";
import { createProvider } from "../providers/factory.js";
import { logTaskEvent } from "./logging.js";
import { taskDir } from "./paths.js";
import type { AgentName } from "./types.js";
import { z } from "zod";

export const consultationResponseSchema = z.object({
  answer: z.string(),
  recommendation: z.string(),
  confidence: z.number().min(0).max(1),
  caveats: z.array(z.string()).optional().default([]),
});

export type ConsultationResponse = z.infer<typeof consultationResponseSchema>;

export interface ConsultationRequest {
  taskId: string;
  /** Agent making the request */
  requestingAgent: AgentName;
  /** Specialist being consulted */
  specialistAgent: AgentName;
  /** The specific question or problem */
  question: string;
  /** Relevant context (max ~2000 chars) */
  context: string;
}

/**
 * Execute a lightweight in-process consultation with a specialist agent.
 * Returns a structured answer or null if consultation fails (best-effort).
 */
export async function consultAgent(req: ConsultationRequest): Promise<ConsultationResponse | null> {
  try {
    const config = await loadResolvedProjectConfig();
    const provider = createProvider(resolveProviderConfigForAgent(config, req.specialistAgent));

    let prompt = "";
    try {
      const fileName = req.specialistAgent.toLowerCase().replace(/\s+/g, "-") + ".md";
      prompt = await loadPromptFile(fileName);
    } catch {
      // No prompt file — use empty; role contract provides context
    }

    const roleContract = buildAgentRoleContract(req.specialistAgent, {
      stage: "consultation",
      taskTypeHint: undefined,
    });

    const systemPrompt = [
      prompt ? `${prompt}\n\n` : "",
      roleContract,
      "\n\nYou are being consulted by another agent. Answer the question concisely and actionably.",
      "\n\nRespond as JSON: { \"answer\": \"string\", \"recommendation\": \"string\", \"confidence\": 0.0-1.0, \"caveats\": [\"string\"] }",
    ].join("");

    const consultInput = {
      requestingAgent: req.requestingAgent,
      question: req.question,
      context: req.context.slice(0, 2000),
    };

    const result = await provider.generateStructured({
      agent: req.specialistAgent,
      taskId: req.taskId,
      stage: "consultation",
      taskType: "Feature",
      systemPrompt,
      input: consultInput,
      expectedJsonSchemaDescription:
        '{ "answer": "string", "recommendation": "string", "confidence": 0.0, "caveats": ["string"] }',
    });

    const response = consultationResponseSchema.parse(result.parsed);

    await logTaskEvent(
      taskDir(req.taskId),
      `Consultation: ${req.requestingAgent} → ${req.specialistAgent}: "${req.question.slice(0, 80)}" → confidence=${response.confidence.toFixed(2)}`,
    );

    return response;
  } catch {
    return null;
  }
}
