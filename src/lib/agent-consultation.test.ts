import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentName } from "./types.js";

const originalCwd = process.cwd();

describe("lib/agent-consultation", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "synx-consultation-test-"));
    // Minimal repo structure for tasks + artifacts
    await fs.mkdir(path.join(tmpDir, ".ai-agents", "tasks"), { recursive: true });
    await fs.mkdir(path.join(tmpDir, ".ai-agents", "runtime", "locks"), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "synx-consultation-test" }),
      "utf8",
    );
    process.chdir(tmpDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns not_triggered when question is trivial (< 30 chars)", async () => {
    const { requestAgentConsultation } = await import("./agent-consultation.js");
    const { createTask } = await import("./task.js");

    const task = await createTask({
      title: "Trivial question test",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "trivial",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const mockProviderFactory = vi.fn();

    const result = await requestAgentConsultation(
      {
        taskId: task.taskId,
        stage: "synx-back-expert",
        requesterAgent: "Synx Back Expert",
        consultantAgent: "Synx DB Architect" as AgentName,
        question: "short?",
        context: "some context",
      },
      mockProviderFactory as any,
    );

    expect(result.status).toBe("not_triggered");
    expect(result.answer).toBeNull();
    expect(result.triggerReasons).toContain("question_too_short");
    expect(mockProviderFactory).not.toHaveBeenCalled();
  });

  it("returns provided with answer on first consultation", async () => {
    const { requestAgentConsultation } = await import("./agent-consultation.js");
    const { createTask } = await import("./task.js");

    const task = await createTask({
      title: "DB schema consultation",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Design a schema for an orders system",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const mockGenerateStructured = vi.fn().mockResolvedValue({
      parsed: {
        answer: "Use a normalized orders table with FK to users and a composite index on (user_id, created_at).",
        keyPoints: ["Use FK constraints", "Add composite index", "Consider partitioning for large datasets"],
        confidence: 0.92,
      },
      provider: "mock",
      model: "static-mock",
      parseRetries: 0,
      estimatedTotalTokens: 50,
    });

    const mockProviderFactory = vi.fn().mockReturnValue({
      generateStructured: mockGenerateStructured,
    });

    const result = await requestAgentConsultation(
      {
        taskId: task.taskId,
        stage: "synx-back-expert",
        requesterAgent: "Synx Back Expert",
        consultantAgent: "Synx DB Architect" as AgentName,
        question: "What is the safest way to design an orders schema with user references and high read throughput?",
        context: "We have a PostgreSQL database with ~10M users.",
      },
      mockProviderFactory as any,
    );

    expect(result.status).toBe("provided");
    expect(result.answer).toBeTruthy();
    expect(result.keyPoints.length).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.reusedCache).toBe(false);
    expect(mockProviderFactory).toHaveBeenCalledWith("Synx DB Architect");
  });

  it("returns cached on duplicate question to same consultant", async () => {
    const { requestAgentConsultation } = await import("./agent-consultation.js");
    const { createTask } = await import("./task.js");

    const task = await createTask({
      title: "Cache dedup test",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Test cache deduplication for agent consultation",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const mockGenerateStructured = vi.fn().mockResolvedValue({
      parsed: {
        answer: "Use zero-downtime migrations with additive changes first.",
        keyPoints: ["Additive first", "Use concurrent index creation"],
        confidence: 0.88,
      },
      provider: "mock",
      model: "static-mock",
      parseRetries: 0,
      estimatedTotalTokens: 50,
    });

    const mockProviderFactory = vi.fn().mockReturnValue({
      generateStructured: mockGenerateStructured,
    });

    const question = "How do I perform a zero-downtime PostgreSQL migration for a high-traffic table with 50M rows?";
    const context = "Production database, cannot afford downtime.";

    // First call — should call provider
    const first = await requestAgentConsultation(
      {
        taskId: task.taskId,
        stage: "synx-back-expert",
        requesterAgent: "Synx Back Expert",
        consultantAgent: "Synx DB Architect" as AgentName,
        question,
        context,
      },
      mockProviderFactory as any,
    );

    expect(first.status).toBe("provided");
    expect(mockGenerateStructured).toHaveBeenCalledTimes(1);

    // Second call with same question — should return cached
    const second = await requestAgentConsultation(
      {
        taskId: task.taskId,
        stage: "synx-back-expert",
        requesterAgent: "Synx Back Expert",
        consultantAgent: "Synx DB Architect" as AgentName,
        question,
        context,
      },
      mockProviderFactory as any,
    );

    expect(second.status).toBe("cached");
    expect(second.reusedCache).toBe(true);
    expect(second.answer).toBe(first.answer);
    // Provider not called again
    expect(mockGenerateStructured).toHaveBeenCalledTimes(1);
  });

  it("returns budget_exhausted after max consultations for same stage+consultant", async () => {
    const { requestAgentConsultation } = await import("./agent-consultation.js");
    const { createTask } = await import("./task.js");

    const task = await createTask({
      title: "Budget exhaustion test",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Test budget exhaustion for agent consultation",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const mockGenerateStructured = vi.fn().mockResolvedValue({
      parsed: {
        answer: "Use proper indexing for better performance.",
        keyPoints: ["Index on FK columns"],
        confidence: 0.75,
      },
      provider: "mock",
      model: "static-mock",
      parseRetries: 0,
      estimatedTotalTokens: 50,
    });

    const mockProviderFactory = vi.fn().mockReturnValue({
      generateStructured: mockGenerateStructured,
    });

    // Make 3 different consultations to exhaust the budget
    for (let i = 0; i < 3; i++) {
      const result = await requestAgentConsultation(
        {
          taskId: task.taskId,
          stage: "synx-back-expert",
          requesterAgent: "Synx Back Expert",
          consultantAgent: "Synx DB Architect" as AgentName,
          question: `How should I optimize query number ${i + 1} with a unique join pattern for high-cardinality data sets?`,
          context: `Context for query ${i + 1}: large table join scenario.`,
        },
        mockProviderFactory as any,
      );
      expect(result.status).toBe("provided");
    }

    // 4th call — should be budget_exhausted
    const fourth = await requestAgentConsultation(
      {
        taskId: task.taskId,
        stage: "synx-back-expert",
        requesterAgent: "Synx Back Expert",
        consultantAgent: "Synx DB Architect" as AgentName,
        question: "What is the best approach for a fourth completely different query optimization scenario in the system?",
        context: "Different context for the fourth question about indexes.",
      },
      mockProviderFactory as any,
    );

    expect(fourth.status).toBe("budget_exhausted");
    expect(fourth.answer).toBeNull();
    // Provider should have been called exactly 3 times (one per provided consultation)
    expect(mockGenerateStructured).toHaveBeenCalledTimes(3);
  });

  it("normalizes questions for dedup (case-insensitive, trimmed)", async () => {
    const { requestAgentConsultation } = await import("./agent-consultation.js");
    const { createTask } = await import("./task.js");

    const task = await createTask({
      title: "Normalization test",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Test question normalization for deduplication",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const mockGenerateStructured = vi.fn().mockResolvedValue({
      parsed: {
        answer: "Always use parameterized queries to prevent SQL injection attacks.",
        keyPoints: ["Parameterized queries", "Avoid string concatenation in SQL"],
        confidence: 0.95,
      },
      provider: "mock",
      model: "static-mock",
      parseRetries: 0,
      estimatedTotalTokens: 50,
    });

    const mockProviderFactory = vi.fn().mockReturnValue({
      generateStructured: mockGenerateStructured,
    });

    const baseQuestion = "How should we prevent SQL injection in our Prisma schema and raw query usage patterns?";
    const uppercaseQuestion = baseQuestion.toUpperCase();
    const paddedQuestion = `   ${baseQuestion}   `;

    // First call with original question
    const first = await requestAgentConsultation(
      {
        taskId: task.taskId,
        stage: "synx-back-expert",
        requesterAgent: "Synx Back Expert",
        consultantAgent: "Synx DB Architect" as AgentName,
        question: baseQuestion,
        context: "Prisma ORM with raw SQL fallback.",
      },
      mockProviderFactory as any,
    );
    expect(first.status).toBe("provided");

    // Second call with uppercase version — should hit cache
    const second = await requestAgentConsultation(
      {
        taskId: task.taskId,
        stage: "synx-back-expert",
        requesterAgent: "Synx Back Expert",
        consultantAgent: "Synx DB Architect" as AgentName,
        question: uppercaseQuestion,
        context: "Prisma ORM with raw SQL fallback.",
      },
      mockProviderFactory as any,
    );
    expect(second.status).toBe("cached");

    // Third call with padded version — should also hit cache
    const third = await requestAgentConsultation(
      {
        taskId: task.taskId,
        stage: "synx-back-expert",
        requesterAgent: "Synx Back Expert",
        consultantAgent: "Synx DB Architect" as AgentName,
        question: paddedQuestion,
        context: "Prisma ORM with raw SQL fallback.",
      },
      mockProviderFactory as any,
    );
    expect(third.status).toBe("cached");

    // Provider should only have been called once
    expect(mockGenerateStructured).toHaveBeenCalledTimes(1);
  });
});
