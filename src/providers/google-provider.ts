import type { ProviderRequest, ProviderResult, ProviderStageConfig } from "../lib/types.js";
import type { LlmProvider } from "./provider.js";
import { buildParseRetryMessages, buildStatelessMessages } from "../lib/provider-messages.js";
import { extractJsonFromText } from "../lib/utils.js";
import { envNumber, envOptionalNumber } from "../lib/env.js";
import { isTaskCancelRequested } from "../lib/task-cancel.js";

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_BASE_URL_ENV = "AI_AGENTS_GOOGLE_BASE_URL";
const DEFAULT_API_KEY_ENV = "AI_AGENTS_GOOGLE_API_KEY";

function resolveTimeoutMs(): number {
  return envNumber("AI_AGENTS_PROVIDER_TIMEOUT_MS", 300_000, {
    integer: true,
    min: 1,
    max: 1_800_000,
  });
}

function resolveJsonParseRetries(): number {
  return envNumber("AI_AGENTS_PROVIDER_JSON_PARSE_RETRIES", 1, {
    integer: true,
    min: 0,
    max: 2,
  });
}

function resolveTemperature(): number {
  return envNumber("AI_AGENTS_GOOGLE_TEMPERATURE", 0.1, {
    min: 0,
    max: 2,
  });
}

function resolveMaxOutputTokens(): number | undefined {
  return envOptionalNumber("AI_AGENTS_GOOGLE_MAX_OUTPUT_TOKENS", {
    integer: true,
    min: 16,
    max: 8192,
  });
}

interface TaskCancellationWatcher {
  signal?: AbortSignal;
  stop: () => void;
}

function createTaskCancellationWatcher(taskId?: string): TaskCancellationWatcher {
  if (!taskId) {
    return {
      signal: undefined,
      stop: () => undefined,
    };
  }

  const controller = new AbortController();
  let timer: NodeJS.Timeout | null = null;
  let checking = false;

  const checkCancellation = async (): Promise<void> => {
    if (checking || controller.signal.aborted) return;
    checking = true;
    try {
      const requested = await isTaskCancelRequested(taskId);
      if (requested) controller.abort(`task-cancelled:${taskId}`);
    } catch {
      // Cancellation probing issues should not break provider requests.
    } finally {
      checking = false;
    }
  };

  void checkCancellation();
  timer = setInterval(() => {
    void checkCancellation();
  }, 400);

  return {
    signal: controller.signal,
    stop: () => {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}

function parseFailureReason(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

function formatMessagesForGoogle(messages: Array<{ role: "system" | "user"; content: string }>): string {
  return messages
    .map((message) => `${message.role === "system" ? "SYSTEM" : "USER"}:\n${message.content}`)
    .join("\n\n");
}

function extractCandidateText(response: unknown): string {
  if (!response || typeof response !== "object") return "";
  const payload = response as { candidates?: unknown[] };
  const candidate = Array.isArray(payload.candidates) ? payload.candidates[0] : undefined;
  if (!candidate || typeof candidate !== "object") return "";
  const candidateRecord = candidate as Record<string, unknown>;
  const content = candidateRecord.content;

  if (typeof candidateRecord.output === "string") {
    return candidateRecord.output;
  }

  if (content && typeof content === "object") {
    const parts = (content as { parts?: unknown[] }).parts;
    if (Array.isArray(parts)) {
      return parts
        .map((part) => {
          if (typeof part === "string") return part;
          if (part && typeof part === "object") {
            return String((part as { text?: unknown }).text || "");
          }
          return "";
        })
        .join("");
    }
    if (typeof (content as { text?: unknown }).text === "string") {
      return (content as { text?: unknown }).text || "";
    }
  }

  return JSON.stringify(response, null, 2);
}

async function callGoogleGenerateContent(args: {
  baseUrl: string;
  model: string;
  apiKey?: string;
  prompt: string;
  temperature: number;
  timeoutMs: number;
  maxOutputTokens?: number;
  cancellationSignal?: AbortSignal;
}): Promise<string> {
  const url = new URL(`${args.baseUrl}/models/${encodeURIComponent(args.model)}:generateContent`);
  if (args.apiKey) {
    url.searchParams.set("key", args.apiKey);
  }

  const generationConfig: Record<string, unknown> = {
    temperature: args.temperature,
    responseMimeType: "text/plain",
  };
  if (args.maxOutputTokens) {
    generationConfig.maxOutputTokens = args.maxOutputTokens;
  }

  const payload: Record<string, unknown> = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: args.prompt,
          },
        ],
      },
    ],
    generationConfig,
  };

  const timeoutSignal = AbortSignal.timeout(args.timeoutMs);
  const signal = args.cancellationSignal ? AbortSignal.any([timeoutSignal, args.cancellationSignal]) : timeoutSignal;

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal,
      body: JSON.stringify(payload),
    });
  } catch (error) {
    if (args.cancellationSignal?.aborted) {
      throw new Error("Task cancellation requested. Provider call aborted.");
    }
    throw new Error(error instanceof Error ? error.message : String(error));
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    throw new Error(`Google provider returned ${response.status}${bodyText ? `: ${bodyText}` : "."}`);
  }

  const responseJson = await response.json();
  return extractCandidateText(responseJson);
}

export class GoogleProvider implements LlmProvider {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly model: string;

  constructor(config: ProviderStageConfig) {
    const baseUrlEnv = config.baseUrlEnv || DEFAULT_BASE_URL_ENV;
    const apiKeyEnv = config.apiKeyEnv || DEFAULT_API_KEY_ENV;
    const baseUrl = (config.baseUrl || process.env[baseUrlEnv] || DEFAULT_BASE_URL).trim();
    if (!baseUrl) {
      throw new Error(`Missing Google provider base URL. Set ${baseUrlEnv} or provide it in configuration.`);
    }
    const apiKey = (config.apiKey || process.env[apiKeyEnv] || "").trim();
    if (!apiKey) {
      throw new Error(`Missing Google provider API key. Set ${apiKeyEnv} or provide it in configuration.`);
    }
    if (!config.model) {
      throw new Error("Google provider requires a model id.");
    }

    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.model = config.model;
  }

  async generateStructured(request: ProviderRequest): Promise<ProviderResult> {
    const timeoutMs = resolveTimeoutMs();
    const parseRetries = resolveJsonParseRetries();
    const parseAttemptsMax = 1 + parseRetries;
    const temperature = resolveTemperature();
    const maxOutputTokens = resolveMaxOutputTokens();
    const cancellationWatcher = createTaskCancellationWatcher(request.taskId);

    let lastParseError = "";
    let lastRawText = "";

    try {
      for (let attempt = 1; attempt <= parseAttemptsMax; attempt += 1) {
        const messages =
          attempt === 1
            ? buildStatelessMessages(request)
            : buildParseRetryMessages({
                request,
                previousRawText: lastRawText,
                parseError: lastParseError,
                attempt,
                maxAttempts: parseAttemptsMax,
              });

        const promptText = formatMessagesForGoogle(messages);
        const rawText = await callGoogleGenerateContent({
          baseUrl: this.baseUrl,
          model: this.model,
          apiKey: this.apiKey,
          prompt: promptText,
          temperature,
          timeoutMs,
          maxOutputTokens,
          cancellationSignal: cancellationWatcher.signal,
        });

        lastRawText = rawText;
        try {
          const parsed = extractJsonFromText(rawText);
          return {
            rawText,
            parsed,
            provider: "google",
            model: this.model,
            parseRetries: attempt - 1,
            validationPassed: true,
            providerAttempts: attempt,
            providerBackoffRetries: 0,
            providerBackoffWaitMs: 0,
            providerRateLimitWaitMs: 0,
            estimatedInputTokens: 0,
            estimatedOutputTokens: 0,
            estimatedTotalTokens: 0,
            estimatedCostUsd: 0,
          };
        } catch (error) {
          lastParseError = parseFailureReason(error);
          if (attempt >= parseAttemptsMax) {
            const failure = new Error(
              `Provider JSON parsing failed after ${attempt} attempt(s). Last parse error: ${lastParseError}`,
            ) as Error & { parseRetries?: number; validationPassed?: boolean };
            failure.parseRetries = attempt - 1;
            failure.validationPassed = false;
            throw failure;
          }
        }
      }
    } finally {
      cancellationWatcher.stop();
    }

    throw new Error("Google provider parsing loop exited unexpectedly.");
  }
}
