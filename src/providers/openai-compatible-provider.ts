import type { AgentName, ProviderRequest, ProviderResult, ProviderStageConfig, TaskType } from "../lib/types.js";
import type { LlmProvider } from "./provider.js";
import { extractJsonFromText } from "../lib/utils.js";

interface ChatCompletionsResponse {
  choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
}

const DEFAULT_SYSTEM_TEMPERATURE = 0.1;
const VALID_TASK_TYPES: TaskType[] = [
  "Feature",
  "Bug",
  "Refactor",
  "Research",
  "Documentation",
  "Mixed",
];

const AGENT_DEFAULT_TEMPERATURES: Record<AgentName, number> = {
  "Dispatcher": 0.1,
  "Spec Planner": 0.1,
  "Bug Investigator": 0.1,
  "Bug Fixer": 0.05,
  "Feature Builder": 0.05,
  "Reviewer": 0.05,
  "QA Validator": 0.05,
  "PR Writer": 0.3,
  "Human Review": 0.1,
};

const TASK_TYPE_DEFAULT_TEMPERATURES: Record<TaskType, number> = {
  "Feature": 0.1,
  "Bug": 0.05,
  "Refactor": 0.05,
  "Research": 0.2,
  "Documentation": 0.3,
  "Mixed": 0.1,
};

function normalizeEnvToken(value: string): string {
  return value
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeAgentEnvToken(agent: AgentName): string {
  return normalizeEnvToken(agent);
}

function isTaskType(value: unknown): value is TaskType {
  return typeof value === "string" && VALID_TASK_TYPES.includes(value as TaskType);
}

function inferTaskType(request: ProviderRequest): TaskType | undefined {
  if (isTaskType(request.taskType)) return request.taskType;
  if (!request.input || typeof request.input !== "object") return undefined;

  const source = request.input as { typeHint?: unknown; task?: { typeHint?: unknown } };
  if (isTaskType(source.task?.typeHint)) return source.task?.typeHint;
  if (isTaskType(source.typeHint)) return source.typeHint;
  return undefined;
}

function normalizeTaskTypeEnvToken(taskType: TaskType): string {
  return normalizeEnvToken(taskType);
}

function parseTemperature(raw: string | undefined): number | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0 || parsed > 2) return null;
  return parsed;
}

function readTemperatureOverride(envName: string): number | null {
  return parseTemperature(process.env[envName]);
}

function resolveTemperature(request: ProviderRequest): number {
  const agentToken = normalizeAgentEnvToken(request.agent);
  const taskType = inferTaskType(request);
  const taskToken = taskType ? normalizeTaskTypeEnvToken(taskType) : "";

  if (agentToken && taskToken) {
    const value = readTemperatureOverride(`AI_AGENTS_TEMPERATURE_${agentToken}_${taskToken}`);
    if (value !== null) return value;
  }

  if (agentToken) {
    const value = readTemperatureOverride(`AI_AGENTS_TEMPERATURE_${agentToken}`);
    if (value !== null) return value;
  }

  if (taskToken) {
    const value = readTemperatureOverride(`AI_AGENTS_TEMPERATURE_${taskToken}`);
    if (value !== null) return value;
  }

  if (typeof AGENT_DEFAULT_TEMPERATURES[request.agent] === "number") {
    return AGENT_DEFAULT_TEMPERATURES[request.agent];
  }

  if (taskType && typeof TASK_TYPE_DEFAULT_TEMPERATURES[taskType] === "number") {
    return TASK_TYPE_DEFAULT_TEMPERATURES[taskType];
  }

  return DEFAULT_SYSTEM_TEMPERATURE;
}

function resolveTimeoutMs(): number {
  const timeoutMsRaw = Number(process.env.AI_AGENTS_PROVIDER_TIMEOUT_MS || "300000");
  return Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0 ? timeoutMsRaw : 300000;
}

function resolveMaxTokens(): number | undefined {
  const maxTokensRaw = Number(process.env.AI_AGENTS_OPENAI_MAX_TOKENS || "");
  if (!Number.isFinite(maxTokensRaw) || maxTokensRaw <= 0) return undefined;
  return Math.floor(maxTokensRaw);
}

function isInputEmbeddedInSystemPrompt(systemPrompt: string, inputJson: string): boolean {
  const maybeEmbeddedSample = inputJson.slice(0, Math.min(240, inputJson.length));
  return maybeEmbeddedSample.length > 32 && systemPrompt.includes(maybeEmbeddedSample);
}

function buildStatelessUserMessage(request: ProviderRequest): string {
  const inputJson = JSON.stringify(request.input, null, 2);
  const userParts = [
    "Return ONLY valid JSON.",
    `Expected shape: ${request.expectedJsonSchemaDescription}`,
  ];

  if (!isInputEmbeddedInSystemPrompt(request.systemPrompt, inputJson)) {
    userParts.push("Input:", inputJson);
  } else {
    userParts.push("Input is already included in the system instructions.");
  }

  return userParts.join("\n\n");
}

function buildStatelessMessages(request: ProviderRequest): Array<{ role: "system" | "user"; content: string }> {
  return [
    { role: "system", content: request.systemPrompt },
    { role: "user", content: buildStatelessUserMessage(request) },
  ];
}

export class OpenAiCompatibleProvider implements LlmProvider {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly model: string;

  constructor(config: ProviderStageConfig) {
    const baseUrlEnv = config.baseUrlEnv || "AI_AGENTS_OPENAI_BASE_URL";
    const apiKeyEnv = config.apiKeyEnv || "AI_AGENTS_OPENAI_API_KEY";
    const baseUrl = (config.baseUrl || process.env[baseUrlEnv] || "").trim();
    const apiKey = (config.apiKey || process.env[apiKeyEnv] || "").trim();

    if (!baseUrl) {
      throw new Error(`Missing provider base URL. Configure it in setup or set ${baseUrlEnv}.`);
    }

    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey || undefined;
    this.model = config.model;
  }

  async generateStructured(request: ProviderRequest): Promise<ProviderResult> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

    const timeoutMs = resolveTimeoutMs();
    const maxTokens = resolveMaxTokens();
    const temperature = resolveTemperature(request);

    const payload: Record<string, unknown> = {
      model: this.model,
      temperature,
      // Stateless-by-design: each call sends only explicit current context (system + user), no prior chat history.
      messages: buildStatelessMessages(request),
    };
    if (maxTokens) payload.max_tokens = maxTokens;

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify(payload),
      });
    } catch (error) {
      const name = error && typeof error === "object" && "name" in error ? (error as { name?: string }).name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        throw new Error(`Provider request timed out after ${timeoutMs}ms.`);
      }
      throw error;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Provider request failed with ${response.status}: ${body}`);
    }

    const json = await response.json() as ChatCompletionsResponse;
    const content = json.choices?.[0]?.message?.content;
    const rawText = typeof content === "string" ? content : (content || []).map((item) => item.text || "").join("\n");
    const parsed = extractJsonFromText(rawText);

    return {
      rawText,
      parsed,
      provider: "openai-compatible",
      model: this.model,
      parseRetries: 0,
      validationPassed: true,
    };
  }
}
