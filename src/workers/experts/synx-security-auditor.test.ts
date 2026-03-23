import { afterEach, beforeEach, describe, expect, vi, it } from "vitest";
import path from "node:path";
import { promises as fs } from "node:fs";
import { SynxSecurityAuditor } from "./synx-security-auditor.js";
import { createTask, loadTaskMeta } from "../../lib/task.js";
import { STAGE_FILE_NAMES, DONE_FILE_NAMES } from "../../lib/constants.js";
import { writeJson } from "../../lib/fs.js";
import { createTestActionContext } from "./expert-test-utils.js";

// ─── Shared mocks ─────────────────────────────────────────────────────────────

vi.mock("../../lib/runtime.js", () => ({
  acquireLock: vi.fn().mockResolvedValue(true),
  releaseLock: vi.fn().mockResolvedValue(undefined),
  isTaskCancelRequested: vi.fn().mockResolvedValue(false),
}));

vi.mock("../../providers/factory.js", () => ({
  createProvider: vi.fn().mockReturnValue({
    generateStructured: vi.fn().mockResolvedValue({
      parsed: {
        auditPassed: true,
        vulnerabilities: [],
        summary: "No vulnerabilities found. Code is secure.",
        owaspCategories: [],
      },
      provider: "mock",
      model: "static-mock",
      parseRetries: 0,
      estimatedTotalTokens: 100,
    }),
  }),
}));

vi.mock("../../lib/config.js", () => ({
  loadResolvedProjectConfig: vi.fn().mockResolvedValue({
    projectName: "test-app",
    language: "typescript",
    framework: "nextjs",
    humanReviewer: "User",
    tasksDir: ".ai-agents/tasks",
    providers: {
      planner: { type: "mock", model: "static-mock" },
      dispatcher: { type: "mock", model: "static-mock" },
    },
    agentProviders: {},
  }),
  loadPromptFile: vi.fn().mockResolvedValue("Mock Prompt {{INPUT_JSON}}"),
  resolveProviderConfigForAgent: vi.fn((cfg: any) => cfg.providers.planner),
}));

// ─── Test setup ───────────────────────────────────────────────────────────────

const originalCwd = process.cwd();

describe.sequential("workers/experts/synx-security-auditor", () => {
  let root = "";
  let repoRoot = "";

  beforeEach(async () => {
    const ctx = await createTestActionContext("synx-security-auditor-test-");
    root = ctx.root;
    repoRoot = ctx.repoRoot;
    process.chdir(repoRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  it("auditPassed:true routes to Human Review (humanApprovalRequired=true)", async () => {
    const task = await createTask({
      title: "Add authentication flow",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Add JWT authentication",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxSecurityAuditor);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-security-auditor",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx Security Auditor",
    });

    const auditor = new SynxSecurityAuditor();
    const processed = await auditor.tryProcess(task.taskId);

    expect(processed).toBe(true);

    const meta = await loadTaskMeta(task.taskId);
    expect(meta.status).toBe("waiting_human");
    expect(meta.humanApprovalRequired).toBe(true);
    expect(meta.nextAgent).toBe("Human Review");
  });

  it("critical vulnerability routes back to previous expert (Synx Front Expert)", async () => {
    const { createProvider } = await import("../../providers/factory.js");
    vi.mocked(createProvider).mockReturnValueOnce({
      generateStructured: vi.fn().mockResolvedValue({
        parsed: {
          auditPassed: false,
          vulnerabilities: [
            {
              severity: "critical",
              category: "Injection",
              description: "SQL injection vulnerability in raw query",
              file: "src/api/users.ts",
              line: 42,
              fix: "Use parameterized queries with Prisma ORM",
            },
          ],
          summary: "Critical SQL injection vulnerability found.",
          blockedReason: "SQL injection must be fixed before deployment.",
          owaspCategories: ["A03:2021-Injection"],
        },
        provider: "mock",
        model: "static-mock",
        parseRetries: 0,
        estimatedTotalTokens: 100,
      }),
    } as any);

    const task = await createTask({
      title: "Add user search feature",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Add user search with SQL",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    // Simulate a previous Synx Front Expert stage in history
    const meta = await loadTaskMeta(task.taskId);
    meta.history.push({
      stage: "synx-front-expert",
      agent: "Synx Front Expert",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      durationMs: 1000,
      status: "done",
    });
    const { saveTaskMeta } = await import("../../lib/task.js");
    await saveTaskMeta(task.taskId, meta);

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxSecurityAuditor);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-security-auditor",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx Security Auditor",
    });

    const auditor = new SynxSecurityAuditor();
    const processed = await auditor.tryProcess(task.taskId);

    expect(processed).toBe(true);

    const updatedMeta = await loadTaskMeta(task.taskId);
    expect(updatedMeta.nextAgent).toBe("Synx Front Expert");
  });

  it("high vulnerability routes back to previous expert", async () => {
    const { createProvider } = await import("../../providers/factory.js");
    vi.mocked(createProvider).mockReturnValueOnce({
      generateStructured: vi.fn().mockResolvedValue({
        parsed: {
          auditPassed: false,
          vulnerabilities: [
            {
              severity: "high",
              category: "Broken Authentication",
              description: "JWT token not validated on protected endpoint",
              file: "src/api/admin.ts",
              line: 15,
              fix: "Add JWT middleware to the admin router",
            },
          ],
          summary: "High severity authentication issue found.",
          blockedReason: "Admin endpoint lacks authentication guard.",
          owaspCategories: ["A07:2021-Identification and Authentication Failures"],
        },
        provider: "mock",
        model: "static-mock",
        parseRetries: 0,
        estimatedTotalTokens: 100,
      }),
    } as any);

    const task = await createTask({
      title: "Add admin panel",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Create admin dashboard",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    // Simulate a previous Synx Back Expert stage in history
    const meta = await loadTaskMeta(task.taskId);
    meta.history.push({
      stage: "synx-back-expert",
      agent: "Synx Back Expert",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      durationMs: 1000,
      status: "done",
    });
    const { saveTaskMeta } = await import("../../lib/task.js");
    await saveTaskMeta(task.taskId, meta);

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxSecurityAuditor);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-security-auditor",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx Security Auditor",
    });

    const auditor = new SynxSecurityAuditor();
    const processed = await auditor.tryProcess(task.taskId);

    expect(processed).toBe(true);

    const updatedMeta = await loadTaskMeta(task.taskId);
    expect(updatedMeta.nextAgent).toBe("Synx Back Expert");
  });

  it("reroute limit reached advances to Human Review despite vulnerabilities", async () => {
    const { createProvider } = await import("../../providers/factory.js");
    vi.mocked(createProvider).mockReturnValueOnce({
      generateStructured: vi.fn().mockResolvedValue({
        parsed: {
          auditPassed: false,
          vulnerabilities: [
            {
              severity: "high",
              category: "Security Misconfiguration",
              description: "Sensitive data exposed in error messages",
              file: "src/lib/error-handler.ts",
              fix: "Strip stack traces from production error responses",
            },
          ],
          summary: "High severity misconfiguration found.",
          blockedReason: "Error messages expose internal details.",
          owaspCategories: ["A05:2021-Security Misconfiguration"],
        },
        provider: "mock",
        model: "static-mock",
        parseRetries: 0,
        estimatedTotalTokens: 100,
      }),
    } as any);

    const task = await createTask({
      title: "Reroute limit test",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Reroute limit security test",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    // Simulate that re-route count is already at MAX (2)
    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxSecurityAuditor);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-security-auditor",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx Security Auditor",
      output: { securityAuditRerouteCount: 2 },
    });

    const auditor = new SynxSecurityAuditor();
    const processed = await auditor.tryProcess(task.taskId);

    expect(processed).toBe(true);

    // Should advance to Human Review despite high issue because reroute limit reached
    const meta = await loadTaskMeta(task.taskId);
    expect(meta.humanApprovalRequired).toBe(true);
    expect(meta.nextAgent).toBe("Human Review");
  });

  it("medium-only vulnerabilities pass through to Human Review", async () => {
    const { createProvider } = await import("../../providers/factory.js");
    vi.mocked(createProvider).mockReturnValueOnce({
      generateStructured: vi.fn().mockResolvedValue({
        parsed: {
          auditPassed: true,
          vulnerabilities: [
            {
              severity: "medium",
              category: "Security Misconfiguration",
              description: "Missing Content-Security-Policy header",
              file: "src/middleware/security.ts",
              fix: "Add CSP header via helmet middleware",
            },
          ],
          summary: "Minor security improvements suggested.",
          owaspCategories: ["A05:2021-Security Misconfiguration"],
        },
        provider: "mock",
        model: "static-mock",
        parseRetries: 0,
        estimatedTotalTokens: 100,
      }),
    } as any);

    const task = await createTask({
      title: "Security hardening",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Harden security headers",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxSecurityAuditor);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-security-auditor",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx Security Auditor",
    });

    const auditor = new SynxSecurityAuditor();
    const processed = await auditor.tryProcess(task.taskId);

    expect(processed).toBe(true);

    const meta = await loadTaskMeta(task.taskId);
    expect(meta.humanApprovalRequired).toBe(true);
    expect(meta.nextAgent).toBe("Human Review");
  });

  it("handles missing previous expert done file gracefully", async () => {
    const task = await createTask({
      title: "Security audit with no prior expert done file",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Some security task",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    // No previous expert done file is created
    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxSecurityAuditor);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-security-auditor",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx Security Auditor",
    });

    const auditor = new SynxSecurityAuditor();
    // Should not throw even though no done file exists for previous expert
    const processed = await auditor.tryProcess(task.taskId);
    expect(processed).toBe(true);

    const meta = await loadTaskMeta(task.taskId);
    expect(meta.humanApprovalRequired).toBe(true);
    expect(meta.nextAgent).toBe("Human Review");
  });
});
