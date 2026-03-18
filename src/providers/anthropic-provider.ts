import type { ProviderRequest, ProviderResult, ProviderStageConfig } from "../lib/types.js";
import type { LlmProvider } from "./provider.js";
import { buildStatelessMessages } from "../lib/provider-messages.js";
import { envNumber } from "../lib/env.js";
import { extractJsonFromText } from "../lib/utils.js";

export const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com";
export const DEFAULT_ANTHROPIC_BASE_URL_ENV = "AI_AGENTS_ANTHROPIC_BASE_URL";
export const DEFAULT_ANTHROPIC_API_KEY_ENV = "AI_AGENTS_ANTHROPIC_API_KEY";

function resolveAnthropicTemperature(): number {
  return envNumber("AI_AGENTS_ANTHROPIC_TEMPERATURE", 0.1, {
    min: 0,
    max: 2,
    integer: false,
  });
}

function resolveAnthropicMaxTokens(): number {
  return envNumber("AI_AGENTS_ANTHROPIC_MAX_TOKENS", 1024, {
    min: 16,
    max: 8192,
    integer: true,
  });
}

function resolveTimeoutMs(): number {
  return envNumber("AI_AGENTS_PROVIDER_TIMEOUT_MS", 300_000, {
    integer: true,
    min: 1,
    max: 1_800_000,
  });
}

function toAnthropicBaseUrl(config: ProviderStageConfig): string {
  const baseUrlEnv = config.baseUrlEnv || DEFAULT_ANTHROPIC_BASE_URL_ENV;
  const candidate = (config.baseUrl || process.env[baseUrlEnv] || DEFAULT_ANTHROPIC_BASE_URL).trim();
  return candidate.replace(/\/$/, "");
}

function toAnthropicApiKey(config: ProviderStageConfig): string {
  const apiKeyEnv = config.apiKeyEnv || DEFAULT_ANTHROPIC_API_KEY_ENV;
  const candidate = (config.apiKey || process.env[apiKeyEnv] || "").trim();
  if (!candidate) {
    throw new Error(`Missing Anthropic API key (${apiKeyEnv}).`);
  }
  return candidate;
}

function formatAnthropicPrompt(messages: Array<{ role: "system" | "user"; content: string }>): string {
  const sections = messages.map((message) => {
    const label = message.role === "system" ? "System" : "User";
    return `${label}:\n${message.content}`;
  });
  return [...sections, "Assistant:"].join("\n\n");
}

async function invokeAnthropicCompletion(args: {
  baseUrl: string;
  model: string;
  apiKey: string;
  prompt: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
}): Promise<string> {
  const url = new URL(`${args.baseUrl}/v1/complete`);
  const payload = {
    model: args.model,
    prompt: args.prompt,
    temperature: args.temperature,
    max_tokens_to_sample: args.maxTokens,
    stop_sequences: ["\n\nHuman:"],
  } as Record<string, unknown>;
  const signal = AbortSignal.timeout(args.timeoutMs);
  let response: Response;

  try {
    response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": args.apiKey,
      },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (error) {
    const name = error && typeof error === "object" && "name" in error
      ? String((error as { name?: unknown }).name || "")
      : "";
    if (name === "AbortError" || name === "TimeoutError") {
      throw new Error(`Anthropic provider timed out after ${args.timeoutMs}ms.`);
    }
    throw new Error(error instanceof Error ? error.message : String(error));
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    throw new Error(`Anthropic provider returned ${response.status}${bodyText ? `: ${bodyText}` : "."}`);
  }

  const json = await response.json().catch((error) => {
    throw new Error(`Anthropic provider returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  });

  if (!json || typeof json !== "object") {
    throw new Error("Anthropic provider returned an unexpected response.");
  }

  const candidate = json.completion;
  if (typeof candidate === "string" && candidate.trim()) {
    return candidate;
  }

  if (Array.isArray(candidate) && candidate.length && typeof candidate[0] === "string") {
    return candidate[0];
  }

  return "";
}

export class AnthropicProvider implements LlmProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(config: ProviderStageConfig) {
    this.baseUrl = toAnthropicBaseUrl(config);
    this.apiKey = toAnthropicApiKey(config);
    this.model = config.model || "";
  }

  async generateStructured(request: ProviderRequest): Promise<ProviderResult> {
    const messages = buildStatelessMessages(request);
    const prompt = formatAnthropicPrompt(messages);
    const temperature = resolveAnthropicTemperature();
    const maxTokens = resolveAnthropicMaxTokens();
    const timeoutMs = resolveTimeoutMs();

    const rawText = await invokeAnthropicCompletion({
      baseUrl: this.baseUrl,
      model: this.model,
      apiKey: this.apiKey,
      prompt,
      temperature,
      maxTokens,
      timeoutMs,
    });

    const parsed = extractJsonFromText(rawText);

    return {
      rawText,
      parsed,
      provider: "anthropic",
      model: this.model,
      parseRetries: 0,
      validationPassed: true,
      providerAttempts: 1,
      providerBackoffRetries: 0,
      providerBackoffWaitMs: 0,
      providerRateLimitWaitMs: 0,
      estimatedInputTokens: 0,
      estimatedOutputTokens: 0,
      estimatedTotalTokens: 0,
      estimatedCostUsd: 0,
    };
  }
}
