import { afterEach, beforeEach, describe, expect, vi, it } from "vitest";
import path from "node:path";
import { promises as fs } from "node:fs";
import { SynxReleaseManager } from "./synx-release-manager.js";
import { createTask } from "../../lib/task.js";
import { STAGE_FILE_NAMES, DONE_FILE_NAMES } from "../../lib/constants.js";
import { writeJson } from "../../lib/fs.js";
import { createTestActionContext } from "./expert-test-utils.js";
import { ARTIFACT_FILES } from "../../lib/task-artifacts.js";

vi.mock("../../lib/task-artifacts.js", () => ({
  ARTIFACT_FILES: {
    releaseCandidate: "release-candidate.json",
  },
  saveTaskArtifact: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/release-state.js", () => ({
  activateStabilizationMode: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/readiness.js", () => ({
  collectReadinessReport: vi.fn().mockResolvedValue({ ok: true, issues: [] }),
}));

vi.mock("../../lib/workspace-tools.js", () => ({
  runProjectChecks: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../lib/command-runner.js", () => ({
  isGitRepository: vi.fn().mockResolvedValue(true),
  readPackageScripts: vi.fn().mockResolvedValue({}),
  selectPackageManager: vi.fn().mockReturnValue("npm"),
}));

vi.mock("../../lib/fs.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/fs.js")>();
  return { 
    ...actual, 
    exists: vi.fn().mockImplementation(async (p: string) => {
      if (p.endsWith("Dockerfile")) return false;
      return actual.exists(p);
    })
  };
});

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

describe.sequential("workers/experts/synx-release-manager", () => {
  let root = "";
  let repoRoot = "";

  beforeEach(async () => {
    const ctx = await createTestActionContext("synx-release-mgr-test-");
    root = ctx.root;
    repoRoot = ctx.repoRoot;
    process.chdir(repoRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  it("blocks release if readiness checks have errors", async () => {
    const { collectReadinessReport } = await import("../../lib/readiness.js");
    vi.mocked(collectReadinessReport).mockResolvedValueOnce({
      ok: false,
      issues: [{ severity: "error", message: "Critical readiness failure" }]
    });

    const task = await createTask({
      title: "Test release manager",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Process release",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxReleaseManager);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-release-manager",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx Release Manager",
    });

    const manager = new SynxReleaseManager();
    const processed = await manager.tryProcess(task.taskId);

    expect(processed).toBe(true);
    const donePath = path.join(task.taskPath, "done", DONE_FILE_NAMES.synxReleaseManager);
    const done = JSON.parse(await fs.readFile(donePath, "utf8"));
    expect(done.output.decision).toBe("release_blocked");
    expect(done.output.nextAgent).toBe("Synx Incident Triage");
  });

  it("approves release and enables stabilization mode when checks pass", async () => {
    const { runProjectChecks } = await import("../../lib/workspace-tools.js");
    const { activateStabilizationMode } = await import("../../lib/release-state.js");

    vi.mocked(runProjectChecks).mockResolvedValueOnce([
      { command: "npm run test", status: "passed", exitCode: 0, diagnostics: [], timedOut: false, durationMs: 100 }
    ]);

    const task = await createTask({
      title: "Test successful release",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Process release",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxReleaseManager);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-release-manager",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx Release Manager",
    });

    const manager = new SynxReleaseManager();
    const processed = await manager.tryProcess(task.taskId);

    expect(processed).toBe(true);
    expect(activateStabilizationMode).toHaveBeenCalled();
    const donePath = path.join(task.taskPath, "done", DONE_FILE_NAMES.synxReleaseManager);
    const done = JSON.parse(await fs.readFile(donePath, "utf8"));
    expect(done.output.decision).toBe("ready_for_release");
    expect(done.output.nextAgent).toBe("Synx Customer Feedback Synthesizer");
  });
});
