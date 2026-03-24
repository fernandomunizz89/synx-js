import { describe, expect, it, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockAppendProjectMemoryFacts = vi.fn().mockResolvedValue(undefined);
const mockExists = vi.fn();
const mockReadJson = vi.fn();
const mockTaskDir = vi.fn((taskId: string) => `/tasks/${taskId}`);

vi.mock("./project-memory.js", () => ({
  appendProjectMemoryFacts: (...args: unknown[]) => mockAppendProjectMemoryFacts(...args),
}));

vi.mock("./fs.js", () => ({
  exists: (...args: unknown[]) => mockExists(...args),
  readJson: (...args: unknown[]) => mockReadJson(...args),
}));

vi.mock("./paths.js", () => ({
  taskDir: (taskId: string) => mockTaskDir(taskId),
}));

vi.mock("./constants.js", () => ({
  DONE_FILE_NAMES: {
    dispatcher: "01-dispatcher.done.json",
  },
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("lib/memory-extractor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("extracts decisions from dispatcher done file and persists to project memory", async () => {
    mockExists.mockResolvedValue(true);
    mockReadJson.mockResolvedValue({
      output: {
        goal: "Implement user authentication with JWT",
        constraints: ["Must use NestJS guards", "No session cookies"],
        suggestedChain: undefined,
      },
    });

    const { extractAndPersistMemoryFacts } = await import("./memory-extractor.js");

    await extractAndPersistMemoryFacts({
      taskId: "task-001",
      taskTitle: "User Auth",
      taskType: "feature",
    });

    expect(mockAppendProjectMemoryFacts).toHaveBeenCalledOnce();
    const [facts, taskId] = mockAppendProjectMemoryFacts.mock.calls[0];
    expect(taskId).toBe("task-001");
    expect(facts.decisions).toContain(
      'Task "User Auth" (feature): Implement user authentication with JWT',
    );
    expect(facts.decisions).toContain("Constraint for feature: Must use NestJS guards");
    expect(facts.decisions).toContain("Constraint for feature: No session cookies");
  });

  it("records agent chain as pattern when suggestedChain present", async () => {
    mockExists.mockResolvedValue(true);
    mockReadJson.mockResolvedValue({
      output: {
        goal: "Build CI pipeline",
        constraints: [],
        suggestedChain: ["Synx DevOps Expert", "Synx QA Engineer"],
      },
    });

    const { extractAndPersistMemoryFacts } = await import("./memory-extractor.js");

    await extractAndPersistMemoryFacts({
      taskId: "task-002",
      taskTitle: "CI Pipeline",
      taskType: "devops",
    });

    expect(mockAppendProjectMemoryFacts).toHaveBeenCalledOnce();
    const [facts] = mockAppendProjectMemoryFacts.mock.calls[0];
    expect(facts.patterns).toContain(
      "Agent chain for devops task: Synx DevOps Expert → Synx QA Engineer",
    );
  });

  it("does not throw when dispatcher done file is missing", async () => {
    mockExists.mockResolvedValue(false);

    const { extractAndPersistMemoryFacts } = await import("./memory-extractor.js");

    await expect(
      extractAndPersistMemoryFacts({
        taskId: "task-003",
        taskTitle: "Some Task",
        taskType: "feature",
      }),
    ).resolves.toBeUndefined();

    // No facts to persist — appendProjectMemoryFacts should NOT be called
    expect(mockAppendProjectMemoryFacts).not.toHaveBeenCalled();
  });
});
