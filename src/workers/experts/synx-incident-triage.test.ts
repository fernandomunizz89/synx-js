import { afterEach, beforeEach, describe, expect, vi, it } from "vitest";
import path from "node:path";
import { promises as fs } from "node:fs";
import { SynxIncidentTriage } from "./synx-incident-triage.js";
import { createTask } from "../../lib/task.js";
import { STAGE_FILE_NAMES, DONE_FILE_NAMES } from "../../lib/constants.js";
import { writeJson } from "../../lib/fs.js";
import { createTestActionContext } from "./expert-test-utils.js";
import { ARTIFACT_FILES } from "../../lib/task-artifacts.js";

vi.mock("../../lib/task-artifacts.js", () => ({
  ARTIFACT_FILES: {
    productionIncidentIntake: "production-incident-intake.json",
  },
  saveTaskArtifact: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/release-state.js", () => ({
  recordReleaseIncident: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/config.js", () => ({
  loadLocalProjectConfig: vi.fn().mockResolvedValue({}),
}));

vi.mock("../../lib/project-memory.js", () => ({
  loadProjectMemory: vi.fn().mockResolvedValue({ version: 1, patterns: [], decisions: [], knownIssues: [], updatedAt: "" }),
}));

vi.mock("../../lib/runtime.js", () => ({
  acquireLock: vi.fn().mockResolvedValue(true),
  releaseLock: vi.fn().mockResolvedValue(undefined),
  isTaskCancelRequested: vi.fn().mockResolvedValue(false),
}));

const originalCwd = process.cwd();

describe.sequential("workers/experts/synx-incident-triage", () => {
  let root = "";
  let repoRoot = "";

  beforeEach(async () => {
    const ctx = await createTestActionContext("synx-incident-triage-test-");
    root = ctx.root;
    repoRoot = ctx.repoRoot;
    process.chdir(repoRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  it("triages a release failure with high severity when smoke checks fail", async () => {
    const { recordReleaseIncident } = await import("../../lib/release-state.js");

    const task = await createTask({
      title: "Triage smoke failure",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Smoke checks failed in CI",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxIncidentTriage);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-incident-triage",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx Incident Triage",
      inputRef: "done/09-synx-release-manager.done.json",
    });

    const previousStagePath = path.join(task.taskPath, "done", "09-synx-release-manager.done.json");
    await writeJson(previousStagePath, {
      taskId: task.taskId,
      stage: "synx-release-manager",
      status: "done",
      createdAt: new Date().toISOString(),
      agent: "Synx Release Manager",
      output: {
        releaseSignals: ["Readiness errors present."],
        smokeChecks: [
          { command: "npm run test", status: "failed", exitCode: 1, diagnostics: ["Failed 1 test"] }
        ],
        readiness: { issues: [{ message: "Missing API Key", severity: "error" }] }
      }
    });

    const triage = new SynxIncidentTriage();
    const processed = await triage.tryProcess(task.taskId);

    expect(processed).toBe(true);
    expect(recordReleaseIncident).toHaveBeenCalledWith(expect.objectContaining({
      severity: "high",
    }));

    const donePath = path.join(task.taskPath, "done", DONE_FILE_NAMES.synxIncidentTriage);
    const done = JSON.parse(await fs.readFile(donePath, "utf8"));
    expect(done.output.severity).toBe("high");
    expect(done.output.rollbackRecommended).toBe(true);
    expect(done.output.nextAgent).toBe("Synx Customer Feedback Synthesizer");
  });

  it("triages minor warnings with low severity", async () => {
    const task = await createTask({
      title: "Triage minor warnings",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Minor warnings detected",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxIncidentTriage);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-incident-triage",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx Incident Triage",
    });

    // No previous output mocked, defaults should apply
    const triage = new SynxIncidentTriage();
    await triage.tryProcess(task.taskId);

    const donePath = path.join(task.taskPath, "done", DONE_FILE_NAMES.synxIncidentTriage);
    const done = JSON.parse(await fs.readFile(donePath, "utf8"));
    expect(done.output.severity).toBe("low");
    expect(done.output.rollbackRecommended).toBe(false);
  });
});
