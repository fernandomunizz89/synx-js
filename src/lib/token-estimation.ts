import { envOptionalNumber } from "./env.js";

const AVG_CHARS_PER_TOKEN = 3.8;

const MODEL_COST_PER_1K: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 0.0025, output: 0.01 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "gpt-4-turbo": { input: 0.01, output: 0.03 },
  "gpt-4": { input: 0.03, output: 0.06 },
  "gpt-3.5-turbo": { input: 0.0005, output: 0.0015 },
};

function normalizeModel(model: string): string {
  return (model || "").trim().toLowerCase();
}

function resolveModelPricing(model: string): { input: number; output: number } | null {
  const normalized = normalizeModel(model);
  if (!normalized) return null;
  if (MODEL_COST_PER_1K[normalized]) return MODEL_COST_PER_1K[normalized];
  const candidate = Object.entries(MODEL_COST_PER_1K)
    .filter(([key]) => normalized.startsWith(`${key}-`) || normalized.includes(key))
    .sort((a, b) => b[0].length - a[0].length)[0];
  return candidate ? candidate[1] : null;
}

function resolveInputCostPer1kTokensUsd(model: string): number {
  const fromEnv = envOptionalNumber("AI_AGENTS_PROVIDER_INPUT_COST_PER_1K_USD", {
    min: 0,
    max: 1000,
  });
  if (typeof fromEnv === "number") return fromEnv;
  return resolveModelPricing(model)?.input ?? 0;
}

function resolveOutputCostPer1kTokensUsd(model: string): number {
  const fromEnv = envOptionalNumber("AI_AGENTS_PROVIDER_OUTPUT_COST_PER_1K_USD", {
    min: 0,
    max: 1000,
  });
  if (typeof fromEnv === "number") return fromEnv;
  return resolveModelPricing(model)?.output ?? 0;
}

export interface TokenEstimate {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export function estimateTokensFromChars(chars: number): number {
  return Math.ceil(Math.max(0, chars) / AVG_CHARS_PER_TOKEN);
}

export function estimateTokens(text: string): number {
  return estimateTokensFromChars((text || "").length);
}

export function estimateTokensFromMessages(messages: Array<{ role: "system" | "user"; content: string }>): number {
  return messages.reduce((sum, message) => sum + estimateTokens(message.content), 0);
}

export function estimateCostUsd(args: {
  model: string;
  inputTokens: number;
  outputTokens: number;
}): number {
  const inputRate = resolveInputCostPer1kTokensUsd(args.model);
  const outputRate = resolveOutputCostPer1kTokensUsd(args.model);
  const cost = ((Math.max(0, args.inputTokens) / 1000) * inputRate) + ((Math.max(0, args.outputTokens) / 1000) * outputRate);
  return Number(cost.toFixed(6));
}

export function buildTokenEstimate(args: {
  model: string;
  inputText: string;
  outputText: string;
}): TokenEstimate {
  const inputTokens = estimateTokens(args.inputText);
  const outputTokens = estimateTokens(args.outputText);
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    estimatedCostUsd: estimateCostUsd({
      model: args.model,
      inputTokens,
      outputTokens,
    }),
  };
}

export function buildTokenEstimateFromCounts(args: {
  model: string;
  inputTokens: number;
  outputTokens: number;
}): TokenEstimate {
  const inputTokens = Math.max(0, Math.floor(args.inputTokens));
  const outputTokens = Math.max(0, Math.floor(args.outputTokens));
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    estimatedCostUsd: estimateCostUsd({
      model: args.model,
      inputTokens,
      outputTokens,
    }),
  };
}
