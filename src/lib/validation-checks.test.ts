import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const commandRunnerMocks = vi.hoisted(() => ({
  readPackageScripts: vi.fn<() => Promise<Record<string, string>>>(),
  selectPackageManager: vi.fn<() => "npm" | "pnpm" | "yarn" | "bun">(),
  buildScriptCommand: vi.fn<(manager: string, script: string, extraArgs?: string[]) => { command: string; args: string[] }>(),
  runCommand: vi.fn<() => Promise<{
    exitCode: number | null;
    timedOut: boolean;
    durationMs: number;
    stdout: string;
    stderr: string;
  }>>(),
}));

vi.mock("./command-runner.js", () => ({
  readPackageScripts: commandRunnerMocks.readPackageScripts,
  selectPackageManager: commandRunnerMocks.selectPackageManager,
  buildScriptCommand: commandRunnerMocks.buildScriptCommand,
  runCommand: commandRunnerMocks.runCommand,
}));

import { detectTestCapabilities, runProjectChecks } from "./validation-checks.js";

describe.sequential("validation-checks", () => {
  let root = "";

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-validation-checks-"));
    commandRunnerMocks.readPackageScripts.mockReset();
    commandRunnerMocks.selectPackageManager.mockReset();
    commandRunnerMocks.buildScriptCommand.mockReset();
    commandRunnerMocks.runCommand.mockReset();

    commandRunnerMocks.selectPackageManager.mockReturnValue("npm");
    commandRunnerMocks.buildScriptCommand.mockImplementation((_, script, extraArgs = []) => ({
      command: "npm",
      args: ["run", script, ...extraArgs],
    }));
  });

  afterEach(async () => {
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  it("detects test capabilities from package scripts and spec files", async () => {
    await fs.mkdir(path.join(root, "e2e"), { recursive: true });
    await fs.writeFile(path.join(root, "e2e", "main-flow.cy.ts"), "describe('x', () => {})", "utf8");
    await fs.writeFile(path.join(root, "e2e", "timer.spec.ts"), "describe('y', () => {})", "utf8");

    commandRunnerMocks.readPackageScripts.mockResolvedValue({
      test: "vitest run",
      "test:e2e": "playwright test",
    });

    const capabilities = await detectTestCapabilities(root);
    expect(capabilities.hasUnitTestScript).toBe(true);
    expect(capabilities.hasE2EScript).toBe(true);
    expect(capabilities.hasE2ESpecFiles).toBe(true);
    expect(capabilities.unitScripts).toContain("test");
    expect(capabilities.e2eScripts).toContain("test:e2e");
    expect(capabilities.e2eSpecFiles).toEqual(expect.arrayContaining(["e2e/main-flow.cy.ts", "e2e/timer.spec.ts"]));
  });

  it("runs scripted checks and returns diagnostics", async () => {
    commandRunnerMocks.readPackageScripts.mockResolvedValue({
      check: "tsc --noEmit",
      "playwright:test": "playwright test",
    });

    commandRunnerMocks.runCommand
      .mockResolvedValueOnce({
        exitCode: 0,
        timedOut: false,
        durationMs: 200,
        stdout: "ok",
        stderr: "",
      })
      .mockResolvedValueOnce({
        exitCode: 1,
        timedOut: false,
        durationMs: 400,
        stdout: "",
        stderr: "Timeout while running e2e",
      });

    const results = await runProjectChecks({
      workspaceRoot: root,
      includeE2E: true,
    });

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      status: "passed",
      command: "npm run check",
    });
    expect(results[1]).toMatchObject({
      status: "failed",
      command: "npm run playwright:test",
    });
    expect(results[1]?.diagnostics?.join("\n")).toMatch(/e2e|timeout/i);
  });

  it("falls back to language-aware TypeScript checks when scripts are missing", async () => {
    commandRunnerMocks.readPackageScripts.mockResolvedValue({});
    commandRunnerMocks.runCommand.mockResolvedValue({
      exitCode: 127,
      timedOut: false,
      durationMs: 12,
      stdout: "",
      stderr: "command not found",
    });
    await fs.writeFile(path.join(root, "tsconfig.json"), "{}", "utf8");

    const results = await runProjectChecks({
      workspaceRoot: root,
      changedFiles: ["src/app.ts"],
      includeE2E: false,
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      command: "npx tsc --noEmit",
      status: "skipped",
    });
    expect(results[0]?.stderrPreview).toContain("Fallback check skipped");
    expect(results[0]?.qaConfigNotes?.[0]).toContain("TypeScript compile/type validation");
  });

  it("returns a no-op skipped check when no script/fallback applies", async () => {
    commandRunnerMocks.readPackageScripts.mockResolvedValue({});

    const results = await runProjectChecks({
      workspaceRoot: root,
      changedFiles: ["README.md"],
      includeE2E: false,
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      command: "[no executable validation checks]",
      status: "skipped",
      exitCode: 0,
    });
  });
});
