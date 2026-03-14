import type { ProviderRequest, ProviderResult, ProviderStageConfig } from "../lib/types.js";
import type { LlmProvider } from "./provider.js";
import { extractJsonFromText } from "../lib/utils.js";

interface ChatCompletionsResponse {
  choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
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

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: this.model,
        temperature: 0.1,
        messages: [
          { role: "system", content: request.systemPrompt },
          {
            role: "user",
            content: [
              "Return ONLY valid JSON.",
              `Expected shape: ${request.expectedJsonSchemaDescription}`,
              "Input:",
              JSON.stringify(request.input, null, 2),
            ].join("\n\n"),
          },
        ],
      }),
    });

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
