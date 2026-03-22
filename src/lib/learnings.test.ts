import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  agentToFileName,
  buildLearningsPromptSection,
  computeLearningStats,
  learningFilePath,
  loadAllLearnings,
  loadRecentLearnings,
  recordLearning,
  recordPipelineApproval,
  recordPipelineReproval,
  listAgentsWithLearnings,
} from "./learnings.js";
import type { LearningEntry, PipelineStepContext } from "./types.js";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("./paths.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("./paths.js")>();
  return { ...original, learningsDir: vi.fn() };
});

import { vi } from "vitest";
import { learningsDir } from "./paths.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const originalCwd = process.cwd();

function makeEntry(overrides: Partial<LearningEntry> = {}): LearningEntry {
  return {
    timestamp: "2026-03-20T10:00:00.000Z",
    taskId: "task-2026-03-20-abc",
    agentId: "my-analyst",
    summary: "Analyzed requirements and identified 3 gaps",
    outcome: "approved",
    pipelineId: "my-pipeline",
    stepIndex: 0,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("lib/learnings", () => {
  let root = "";

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-learnings-test-"));
    const repoRoot = path.join(root, "repo");
    await fs.mkdir(repoRoot, { recursive: true });
    await fs.writeFile(
      path.join(repoRoot, "package.json"),
      JSON.stringify({ name: "test" }),
      "utf8",
    );
    process.chdir(repoRoot);
    vi.mocked(learningsDir).mockReturnValue(path.join(repoRoot, ".ai-agents", "learnings"));
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.clearAllMocks();
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  // ─── agentToFileName ──────────────────────────────────────────────────────

  describe("agentToFileName", () => {
    it("lowercases and replaces spaces with hyphens", () => {
      expect(agentToFileName("Synx Back Expert")).toBe("synx-back-expert");
    });

    it("handles kebab-case ids unchanged", () => {
      expect(agentToFileName("my-analyst")).toBe("my-analyst");
    });

    it("collapses multiple separators", () => {
      expect(agentToFileName("My  Cool   Agent")).toBe("my-cool-agent");
    });

    it("strips leading/trailing hyphens", () => {
      expect(agentToFileName("-weird-")).toBe("weird");
    });
  });

  // ─── recordLearning / loadRecentLearnings ─────────────────────────────────

  it("records and reloads a learning entry", async () => {
    const entry = makeEntry();
    await recordLearning(entry);
    const loaded = await loadRecentLearnings("my-analyst");
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toMatchObject({ taskId: "task-2026-03-20-abc", outcome: "approved" });
  });

  it("appends multiple entries for the same agent", async () => {
    await recordLearning(makeEntry({ taskId: "task-1" }));
    await recordLearning(makeEntry({ taskId: "task-2" }));
    await recordLearning(makeEntry({ taskId: "task-3" }));
    const loaded = await loadAllLearnings("my-analyst");
    expect(loaded).toHaveLength(3);
  });

  it("loadRecentLearnings returns last N entries", async () => {
    for (let i = 0; i < 8; i++) {
      await recordLearning(makeEntry({ taskId: `task-${i}` }));
    }
    const recent = await loadRecentLearnings("my-analyst", 3);
    expect(recent).toHaveLength(3);
    expect(recent[2].taskId).toBe("task-7"); // last entry
  });

  it("loadRecentLearnings returns empty array when no file exists", async () => {
    const result = await loadRecentLearnings("nonexistent-agent");
    expect(result).toEqual([]);
  });

  it("skips malformed JSONL lines silently", async () => {
    const dir = vi.mocked(learningsDir)();
    await fs.mkdir(dir, { recursive: true });
    const file = learningFilePath("my-analyst");
    await fs.writeFile(
      file,
      [
        JSON.stringify(makeEntry({ taskId: "valid-1" })),
        "not-valid-json",
        JSON.stringify(makeEntry({ taskId: "valid-2" })),
      ].join("\n") + "\n",
      "utf8",
    );
    const loaded = await loadAllLearnings("my-analyst");
    expect(loaded).toHaveLength(2);
    expect(loaded.map((e) => e.taskId)).toEqual(["valid-1", "valid-2"]);
  });

  // ─── recordPipelineApproval ───────────────────────────────────────────────

  it("recordPipelineApproval writes one entry per completed step", async () => {
    const steps: PipelineStepContext[] = [
      { stepIndex: 0, agent: "analyst", summary: "Step 0 done", keyOutputs: {}, provider: "anthropic", model: "claude-sonnet-4-6" },
      { stepIndex: 1, agent: "builder", summary: "Step 1 done", keyOutputs: {} },
    ];
    await recordPipelineApproval("task-xyz", "my-pipeline", steps);
    const analystEntries = await loadAllLearnings("analyst");
    const builderEntries = await loadAllLearnings("builder");
    expect(analystEntries).toHaveLength(1);
    expect(analystEntries[0]).toMatchObject({ outcome: "approved", pipelineId: "my-pipeline", stepIndex: 0 });
    expect(builderEntries).toHaveLength(1);
    expect(builderEntries[0]).toMatchObject({ outcome: "approved", stepIndex: 1 });
  });

  // ─── recordPipelineReproval ───────────────────────────────────────────────

  it("recordPipelineReproval writes entry for the last step only", async () => {
    const steps: PipelineStepContext[] = [
      { stepIndex: 0, agent: "analyst", summary: "Analysis done", keyOutputs: {} },
      { stepIndex: 1, agent: "builder", summary: "Built feature", keyOutputs: {} },
    ];
    await recordPipelineReproval("task-xyz", "my-pipeline", steps, "Missing edge case tests");
    const builderEntries = await loadAllLearnings("builder");
    expect(builderEntries).toHaveLength(1);
    expect(builderEntries[0]).toMatchObject({
      outcome: "reproved",
      reproveReason: "Missing edge case tests",
      stepIndex: 1,
    });
    // analyst should not have an entry
    const analystEntries = await loadAllLearnings("analyst");
    expect(analystEntries).toHaveLength(0);
  });

  it("recordPipelineReproval does nothing when completedSteps is empty", async () => {
    await recordPipelineReproval("task-xyz", "my-pipeline", [], "some reason");
    const agents = await listAgentsWithLearnings();
    expect(agents).toHaveLength(0);
  });

  // ─── listAgentsWithLearnings ─────────────────────────────────────────────

  it("listAgentsWithLearnings returns agent file names", async () => {
    await recordLearning(makeEntry({ agentId: "analyst" }));
    await recordLearning(makeEntry({ agentId: "builder" }));
    const agents = await listAgentsWithLearnings();
    expect(agents).toContain("analyst");
    expect(agents).toContain("builder");
  });

  it("listAgentsWithLearnings returns empty array when dir does not exist", async () => {
    const agents = await listAgentsWithLearnings();
    expect(agents).toEqual([]);
  });

  // ─── buildLearningsPromptSection ─────────────────────────────────────────

  describe("buildLearningsPromptSection", () => {
    it("returns empty string for no entries", () => {
      expect(buildLearningsPromptSection([])).toBe("");
    });

    it("includes approved entry with ✅", () => {
      const section = buildLearningsPromptSection([makeEntry({ outcome: "approved" })]);
      expect(section).toContain("✅");
      expect(section).toContain("Approved");
      expect(section).toContain("Analyzed requirements");
    });

    it("includes reproved entry with ❌ and feedback", () => {
      const section = buildLearningsPromptSection([
        makeEntry({ outcome: "reproved", reproveReason: "Missing tests" }),
      ]);
      expect(section).toContain("❌");
      expect(section).toContain("Reproved");
      expect(section).toContain("Missing tests");
    });

    it("does not include feedback line for approved entries", () => {
      const section = buildLearningsPromptSection([makeEntry({ outcome: "approved" })]);
      expect(section).not.toContain("Feedback:");
    });

    it("numbers entries sequentially", () => {
      const section = buildLearningsPromptSection([
        makeEntry({ taskId: "a" }),
        makeEntry({ taskId: "b" }),
        makeEntry({ taskId: "c" }),
      ]);
      expect(section).toContain("1.");
      expect(section).toContain("2.");
      expect(section).toContain("3.");
    });
  });

  // ─── computeLearningStats ─────────────────────────────────────────────────

  describe("computeLearningStats", () => {
    it("computes correct approval rate", () => {
      const entries = [
        makeEntry({ outcome: "approved" }),
        makeEntry({ outcome: "approved" }),
        makeEntry({ outcome: "reproved" }),
        makeEntry({ outcome: "approved" }),
      ];
      const stats = computeLearningStats("my-analyst", entries);
      expect(stats.total).toBe(4);
      expect(stats.approved).toBe(3);
      expect(stats.reproved).toBe(1);
      expect(stats.approvalRate).toBe(75);
    });

    it("returns 0% approval rate for empty entries", () => {
      const stats = computeLearningStats("my-analyst", []);
      expect(stats.total).toBe(0);
      expect(stats.approvalRate).toBe(0);
      expect(stats.mostRecentOutcome).toBeNull();
    });

    it("identifies most recent outcome", () => {
      const entries = [
        makeEntry({ timestamp: "2026-03-18T10:00:00.000Z", outcome: "approved" }),
        makeEntry({ timestamp: "2026-03-20T10:00:00.000Z", outcome: "reproved" }),
        makeEntry({ timestamp: "2026-03-19T10:00:00.000Z", outcome: "approved" }),
      ];
      const stats = computeLearningStats("my-analyst", entries);
      expect(stats.mostRecentOutcome).toBe("reproved");
      expect(stats.lastTimestamp).toBe("2026-03-20T10:00:00.000Z");
    });
  });
});
