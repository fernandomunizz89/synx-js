import { afterEach, beforeEach, describe, expect, vi, it } from "vitest";
import path from "node:path";
import { promises as fs } from "node:fs";
import { SynxCustomerFeedbackSynthesizer } from "./synx-customer-feedback-synthesizer.js";
import { createTask } from "../../lib/task.js";
import { STAGE_FILE_NAMES, DONE_FILE_NAMES } from "../../lib/constants.js";
import { writeJson } from "../../lib/fs.js";
import { createTestActionContext } from "./expert-test-utils.js";
import { ARTIFACT_FILES } from "../../lib/task-artifacts.js";

vi.mock("../../lib/task-artifacts.js", () => ({
  ARTIFACT_FILES: {
    releaseCandidate: "release-candidate.json",
    productionIncidentIntake: "production-incident-intake.json",
    customerFeedbackSummary: "customer-feedback-summary.json",
  },
  loadTaskArtifact: vi.fn(),
  saveTaskArtifact: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/release-state.js", () => ({
  updateStabilizationFocus: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/runtime.js", () => ({
  acquireLock: vi.fn().mockResolvedValue(true),
  releaseLock: vi.fn().mockResolvedValue(undefined),
  isTaskCancelRequested: vi.fn().mockResolvedValue(false),
}));

const originalCwd = process.cwd();

describe.sequential("workers/experts/synx-customer-feedback-synthesizer", () => {
  let root = "";
  let repoRoot = "";

  beforeEach(async () => {
    const ctx = await createTestActionContext("synx-feedback-synth-test-");
    root = ctx.root;
    repoRoot = ctx.repoRoot;
    process.chdir(repoRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  it("synthesizes feedback from release candidate and incident intake", async () => {
    const { loadTaskArtifact } = await import("../../lib/task-artifacts.js");
    const { updateStabilizationFocus } = await import("../../lib/release-state.js");

    vi.mocked(loadTaskArtifact).mockImplementation(async (taskId, fileName) => {
      if (fileName === "release-candidate.json") {
        return { releaseSignals: ["UI glitch fixed", "Performance improved"] };
      }
      if (fileName === "production-incident-intake.json") {
        return { primarySignals: ["High latency in API", "DB connection timeouts"], suspectedComponents: ["api-gateway", "db-proxy"] };
      }
      if (fileName === "qa-return-context-history.json") {
        return { entries: [{ summary: "QA found minor issues", failures: ["Button alignment"] }] };
      }
      return {};
    });

    const task = await createTask({
      title: "Synthesize launch feedback",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Analyze release signals and production incidents",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxFeedbackSynth);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-customer-feedback-synthesizer",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx Customer Feedback Synthesizer",
    });

    const synthesizer = new SynxCustomerFeedbackSynthesizer();
    const processed = await synthesizer.tryProcess(task.taskId);

    expect(processed).toBe(true);
    expect(updateStabilizationFocus).toHaveBeenCalledWith(expect.objectContaining({
      taskId: task.taskId,
      summary: expect.stringContaining("synthesized"),
    }));

    const donePath = path.join(task.taskPath, "done", DONE_FILE_NAMES.synxFeedbackSynth);
    const doneExists = await fs.stat(donePath).then(() => true).catch(() => false);
    expect(doneExists).toBe(true);
  });

  it("handles empty or missing artifacts gracefully", async () => {
    const { loadTaskArtifact } = await import("../../lib/task-artifacts.js");
    vi.mocked(loadTaskArtifact).mockResolvedValue(null);

    const task = await createTask({
      title: "Synthesize empty feedback",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Analyze nothing",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxFeedbackSynth);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-customer-feedback-synthesizer",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx Customer Feedback Synthesizer",
    });

    const synthesizer = new SynxCustomerFeedbackSynthesizer();
    const processed = await synthesizer.tryProcess(task.taskId);

    expect(processed).toBe(true);
    const donePath = path.join(task.taskPath, "done", DONE_FILE_NAMES.synxFeedbackSynth);
    const done = JSON.parse(await fs.readFile(donePath, "utf8"));
    expect(done.output.themes).toEqual([]);
    expect(done.output.impactAssessment).toContain("No incident intake registered; stabilization focuses on confidence-building and monitoring");
  });
});
