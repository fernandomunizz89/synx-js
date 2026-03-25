import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ConsultationRequest } from "./agent-consultation.js";

vi.mock("./config.js", () => ({
  loadResolvedProjectConfig: vi.fn(),
  resolveProviderConfigForAgent: vi.fn(),
  loadPromptFile: vi.fn(),
}));

vi.mock("./agent-role-contract.js", () => ({
  buildAgentRoleContract: vi.fn(() => "ROLE CONTRACT"),
}));

vi.mock("../providers/factory.js", () => ({
  createProvider: vi.fn(),
}));

vi.mock("./logging.js", () => ({
  logTaskEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./paths.js", () => ({
  taskDir: vi.fn((id: string) => `/tasks/${id}`),
}));

import { consultAgent } from "./agent-consultation.js";
import { loadResolvedProjectConfig, resolveProviderConfigForAgent, loadPromptFile } from "./config.js";
import { createProvider } from "../providers/factory.js";

const mockLoadResolvedProjectConfig = vi.mocked(loadResolvedProjectConfig);
const mockResolveProviderConfigForAgent = vi.mocked(resolveProviderConfigForAgent);
const mockLoadPromptFile = vi.mocked(loadPromptFile);
const mockCreateProvider = vi.mocked(createProvider);

const baseConfig = {
  projectName: "test",
  language: "typescript",
  framework: "nextjs",
  humanReviewer: "human",
  tasksDir: ".ai-agents/tasks",
  providers: { dispatcher: { type: "mock" as const, model: "test-model" } },
  agentProviders: {},
};

const baseProviderConfig = { type: "mock" as const, model: "test-model" };

describe("agent-consultation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadResolvedProjectConfig.mockResolvedValue(baseConfig);
    mockResolveProviderConfigForAgent.mockReturnValue(baseProviderConfig);
    mockLoadPromptFile.mockResolvedValue("# System Prompt");
  });

  it("returns consultation response from specialist", async () => {
    const mockGenerateStructured = vi.fn().mockResolvedValue({
      rawText: '{"answer":"Use react query","recommendation":"Prefer react-query","confidence":0.9,"caveats":[]}',
      parsed: {
        answer: "Use react query",
        recommendation: "Prefer react-query",
        confidence: 0.9,
        caveats: [],
      },
      provider: "mock",
      model: "test-model",
      parseRetries: 0,
      validationPassed: true,
      providerAttempts: 1,
      providerBackoffRetries: 0,
      providerBackoffWaitMs: 0,
      providerRateLimitWaitMs: 0,
      estimatedInputTokens: 10,
      estimatedOutputTokens: 10,
      estimatedTotalTokens: 20,
      estimatedCostUsd: 0.001,
    });
    mockCreateProvider.mockReturnValue({ generateStructured: mockGenerateStructured } as never);

    const req: ConsultationRequest = {
      taskId: "task-001",
      requestingAgent: "Synx Front Expert",
      specialistAgent: "Synx Back Expert",
      question: "Should I use react-query for data fetching?",
      context: "We have a Next.js app with REST API",
    };

    const result = await consultAgent(req);

    expect(result).not.toBeNull();
    expect(result?.answer).toBe("Use react query");
    expect(result?.recommendation).toBe("Prefer react-query");
    expect(result?.confidence).toBe(0.9);
    expect(result?.caveats).toEqual([]);
  });

  it("returns null when provider throws", async () => {
    const mockGenerateStructured = vi.fn().mockRejectedValue(new Error("Provider error"));
    mockCreateProvider.mockReturnValue({ generateStructured: mockGenerateStructured } as never);

    const req: ConsultationRequest = {
      taskId: "task-002",
      requestingAgent: "Synx Front Expert",
      specialistAgent: "Synx QA Engineer",
      question: "How should I test this component?",
      context: "React component",
    };

    const result = await consultAgent(req);

    expect(result).toBeNull();
  });

  it("truncates context to 2000 chars", async () => {
    const longContext = "x".repeat(5000);
    const mockGenerateStructured = vi.fn().mockResolvedValue({
      rawText: '{"answer":"ok","recommendation":"ok","confidence":0.8,"caveats":[]}',
      parsed: {
        answer: "ok",
        recommendation: "ok",
        confidence: 0.8,
        caveats: [],
      },
      provider: "mock",
      model: "test-model",
      parseRetries: 0,
      validationPassed: true,
      providerAttempts: 1,
      providerBackoffRetries: 0,
      providerBackoffWaitMs: 0,
      providerRateLimitWaitMs: 0,
      estimatedInputTokens: 10,
      estimatedOutputTokens: 10,
      estimatedTotalTokens: 20,
      estimatedCostUsd: 0.001,
    });
    mockCreateProvider.mockReturnValue({ generateStructured: mockGenerateStructured } as never);

    const req: ConsultationRequest = {
      taskId: "task-003",
      requestingAgent: "Synx Front Expert",
      specialistAgent: "Synx Back Expert",
      question: "Question?",
      context: longContext,
    };

    await consultAgent(req);

    expect(mockGenerateStructured).toHaveBeenCalledOnce();
    const callArg = mockGenerateStructured.mock.calls[0][0] as { input: { context: string } };
    expect(callArg.input.context.length).toBe(2000);
  });
});
