import { envNumber } from "./env.js";
import type { ProviderRequest } from "./types.js";
import { estimateTokensFromChars } from "./token-estimation.js";
import {
  encodeInputJson,
  resolveInputEncodingModeFromEnv,
  type InputEncodingMode,
} from "./input-encoding.js";

function resolveContextBudgetChars(): number {
  return envNumber("AI_AGENTS_PROVIDER_MAX_CONTEXT_CHARS", 120_000, {
    integer: true,
    min: 8_000,
    max: 1_000_000,
  });
}

function resolveInputPayloadBudgetChars(): number {
  return envNumber("AI_AGENTS_PROVIDER_MAX_INPUT_CHARS", 90_000, {
    integer: true,
    min: 2_000,
    max: 500_000,
  });
}

function truncateTextForBudget(value: string, maxChars: number, label: string): { text: string; truncated: boolean } {
  if (value.length <= maxChars) return { text: value, truncated: false };
  const marker = `\n\n[${label} truncated to ${maxChars} chars from ${value.length} chars]`;
  const headLimit = Math.max(0, maxChars - marker.length);
  return {
    text: `${value.slice(0, headLimit)}${marker}`,
    truncated: true,
  };
}

function enforceContextCharBudget(args: {
  systemPrompt: string;
  userPrompt: string;
}): { systemPrompt: string; userPrompt: string; truncated: boolean; contextBudgetChars: number } {
  const contextBudgetChars = resolveContextBudgetChars();
  let systemPrompt = args.systemPrompt;
  let userPrompt = args.userPrompt;
  let truncated = false;

  const minSystemChars = 2000;
  const minUserChars = 2000;
  const totalChars = () => systemPrompt.length + userPrompt.length;
  if (totalChars() <= contextBudgetChars) {
    return { systemPrompt, userPrompt, truncated, contextBudgetChars };
  }

  const overflowAfterSystem = totalChars() - contextBudgetChars;
  if (overflowAfterSystem > 0) {
    const nextUserLimit = Math.max(minUserChars, userPrompt.length - overflowAfterSystem);
    const userTrimmed = truncateTextForBudget(userPrompt, nextUserLimit, "user_prompt");
    userPrompt = userTrimmed.text;
    truncated = truncated || userTrimmed.truncated;
  }

  if (totalChars() > contextBudgetChars) {
    const overflowAfterUser = totalChars() - contextBudgetChars;
    const nextSystemLimit = Math.max(minSystemChars, systemPrompt.length - overflowAfterUser);
    const systemTrimmed = truncateTextForBudget(systemPrompt, nextSystemLimit, "system_prompt");
    systemPrompt = systemTrimmed.text;
    truncated = truncated || systemTrimmed.truncated;
  }

  return { systemPrompt, userPrompt, truncated, contextBudgetChars };
}

function shortenText(value: string, maxChars: number): string {
  const next = value.trim();
  if (next.length <= maxChars) return next;
  return `${next.slice(0, Math.max(0, maxChars - 1))}…`;
}

function normalizeForEmbedding(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isInputEmbeddedInSystemPrompt(systemPrompt: string, inputJson: string): boolean {
  // Normaliza espaços para funcionar mesmo quando mudamos de JSON "pretty" para "minified".
  const normalizedSystem = normalizeForEmbedding(systemPrompt);
  const normalizedSample = normalizeForEmbedding(inputJson).slice(0, Math.min(240, inputJson.length));
  return normalizedSample.length > 32 && normalizedSystem.includes(normalizedSample);
}

function resolveInputEncodingMode(): InputEncodingMode {
  return resolveInputEncodingModeFromEnv();
}

function buildStatelessUserMessage(request: ProviderRequest): string {
  const inputEncodingMode = resolveInputEncodingMode();
  const encoding = encodeInputJson(request.input, { mode: inputEncodingMode });
  const inputJsonRaw = encoding.json;
  const inputBudget = resolveInputPayloadBudgetChars();
  const inputLabel = inputEncodingMode === "pretty"
    ? "input_json"
    : `input_json_${inputEncodingMode}`;
  const inputJson = truncateTextForBudget(inputJsonRaw, inputBudget, inputLabel).text;
  const userParts = [
    "Return ONLY valid JSON.",
    `Expected shape: ${request.expectedJsonSchemaDescription}`,
  ];

  if (inputEncodingMode !== "pretty") {
    const prettyTokens = encoding.meta.prettyTokensEstimate;
    const encodedTokens = encoding.meta.encodedTokensEstimate;
    const savingsChars = encoding.meta.savingsChars;
    const savingsTokens = encoding.meta.savingsTokensEstimate;

    userParts.push(
      `Input encoding=${encoding.meta.actualMode} (pre-trunc estimate): ` +
      `pretty=${encoding.meta.prettyChars} chars (~${prettyTokens} tokens) -> ` +
      `encoded=${encoding.meta.encodedChars} chars (~${encodedTokens} tokens), ` +
      `savings=~${Math.max(0, savingsChars)} chars (~${Math.max(0, savingsTokens)} tokens).`,
    );
  }

  if (!isInputEmbeddedInSystemPrompt(request.systemPrompt, inputJson)) {
    userParts.push("Input:", inputJson);
  } else {
    userParts.push("Input is already included in the system instructions.");
  }

  if (inputEncodingMode === "toon") {
    // Instrução curta para o modelo interpretar o TOON-like: ignorar wrapper e reconstruir chaves.
    userParts.push(
      "TOONv1 decode: ignore __toonV/__toonKeysMap; use __toonData; for each object key code (like k0), replace it with __toonKeysMap[code].",
    );
  }

  if (inputJsonRaw.length > inputJson.length) {
    userParts.push(
      `Input payload was truncated for budget control: ${inputJsonRaw.length} chars (~${estimateTokensFromChars(inputJsonRaw.length)} tokens) -> ${inputJson.length} chars (~${estimateTokensFromChars(inputJson.length)} tokens).`,
    );
  }

  return userParts.join("\n\n");
}

export function buildStatelessMessages(request: ProviderRequest): Array<{ role: "system" | "user"; content: string }> {
  const userPrompt = buildStatelessUserMessage(request);
  const budgeted = enforceContextCharBudget({
    systemPrompt: request.systemPrompt,
    userPrompt,
  });
  const finalUserPrompt = budgeted.truncated
    ? `${budgeted.userPrompt}\n\nContext budget control applied: ${budgeted.contextBudgetChars} total chars (~${estimateTokensFromChars(budgeted.contextBudgetChars)} tokens estimate).`
    : budgeted.userPrompt;
  return [
    { role: "system", content: budgeted.systemPrompt },
    { role: "user", content: finalUserPrompt },
  ];
}

export function buildParseRetryMessages(args: {
  request: ProviderRequest;
  previousRawText: string;
  parseError: string;
  attempt: number;
  maxAttempts: number;
}): Array<{ role: "system" | "user"; content: string }> {
  const base = buildStatelessMessages(args.request);
  const correction = [
    `Previous response could not be parsed as valid JSON: ${args.parseError}`,
    `Retry attempt ${args.attempt}/${args.maxAttempts}.`,
    "Respond with ONLY valid JSON.",
    "Do NOT include markdown code fences.",
    "Do NOT include explanatory text before or after the JSON.",
    "Preserve exactly the expected JSON shape.",
    `Expected shape: ${args.request.expectedJsonSchemaDescription}`,
    "If uncertain, still return best-effort JSON object/array matching the required schema.",
    "Do not omit required keys.",
    `Previous invalid response sample:\n${shortenText(args.previousRawText, 1200) || "[empty]"}`,
  ].join("\n");
  return [
    ...base,
    { role: "user", content: correction },
  ];
}
