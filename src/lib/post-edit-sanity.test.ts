import { describe, expect, it, vi, beforeEach } from "vitest";
import { runPostEditSanityChecks } from "./post-edit-sanity.js";
import { runCommand } from "./workspace-tools.js";
import { promises as fs, existsSync } from "node:fs";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: vi.fn(),
    promises: {
      ...actual.promises,
      readFile: vi.fn(),
    },
  };
});

vi.mock("./workspace-tools.js", () => ({
  runCommand: vi.fn(),
}));

describe("post-edit-sanity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty results if no commands or heuristics are applicable", async () => {
    vi.mocked(existsSync).mockReturnValue(false); // No lockfiles
    vi.mocked(fs.readFile).mockRejectedValue(new Error("No package.json"));

    const result = await runPostEditSanityChecks({
      workspaceRoot: "/workspace",
      changedFiles: [],
    });

    expect(result.metrics.plannedChecks).toBe(0);
    expect(result.checks).toHaveLength(0);
  });

  it("identifies default scripts based on package.json presence", async () => {
    vi.mocked(existsSync).mockImplementation((pathStr) => {
      // Mock pnpm lock
      return pathStr.toString().includes("pnpm-lock.yaml");
    });

    vi.mocked(fs.readFile).mockImplementation(async (pathStr) => {
      if (pathStr.toString().endsWith("package.json")) {
        return JSON.stringify({
          scripts: {
            lint: "eslint .",
            typecheck: "tsc --noEmit",
            build: "esbuild",
            check: "npm run test",
          },
        });
      }
      return "";
    });

    vi.mocked(runCommand).mockResolvedValue({
      command: "mock",
      args: [],
      stdout: "success",
      stderr: "",
      exitCode: 0,
      timedOut: false,
      durationMs: 10,
    });

    const result = await runPostEditSanityChecks({
      workspaceRoot: "/workspace",
      changedFiles: ["src/app.ts"],
      requireBuildScript: true,
    });

    expect(result.metrics.plannedChecks).toBeGreaterThan(0);
    // Since pnpm-lock.yaml is detected, it should run with pnpm
    expect(result.checks.some((c) => c.command.includes("pnpm run --if-present lint"))).toBe(true);
    expect(result.checks.some((c) => c.command.includes("pnpm run --if-present typecheck"))).toBe(true);
    // Because check runs tests, it categorizes as heavy. The code explicitly omits heavy 'check' if 'build' is present.
    expect(result.checks.some((c) => c.command.includes("pnpm run --if-present check"))).toBe(false);
    expect(result.checks.some((c) => c.command.includes("pnpm run --if-present build"))).toBe(true);
    expect(runCommand).toHaveBeenCalledTimes(3); // lint, typecheck, build
  });

  it("detects yarn, bun, and npm gracefully", async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
      scripts: { lint: "eslint" },
    }));

    vi.mocked(runCommand).mockResolvedValue({
      command: "mock",
      args: [],
      stdout: "",
      stderr: "",
      exitCode: 0,
      timedOut: false,
      durationMs: 1,
    });

    // Test YARN
    vi.mocked(existsSync).mockImplementation((p) => p.toString().endsWith("yarn.lock"));
    let result = await runPostEditSanityChecks({ workspaceRoot: "/workspace", changedFiles: ["a.ts"] });
    expect(result.checks[0].command).toContain("yarn run lint");

    // Test BUN
    vi.mocked(existsSync).mockImplementation((p) => p.toString().endsWith("bun.lockb"));
    result = await runPostEditSanityChecks({ workspaceRoot: "/workspace", changedFiles: ["a.ts"] });
    expect(result.checks[0].command).toContain("bun run lint");

    // Test NPM fallback
    vi.mocked(existsSync).mockReturnValue(false);
    result = await runPostEditSanityChecks({ workspaceRoot: "/workspace", changedFiles: ["a.ts"] });
    expect(result.checks[0].command).toContain("npm run --if-present lint");
  });

  it("injects fallback language syntax checks based on detected manifests", async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error("No package.json")); // Clear out package scripts

    // Test TypeScript
    vi.mocked(existsSync).mockImplementation((p) => p.toString().endsWith("tsconfig.json"));
    let result = await runPostEditSanityChecks({ workspaceRoot: "/workspace", changedFiles: ["a.ts"] });
    expect(result.checks.some((c) => c.command.includes("tsc --noEmit"))).toBe(true);

    // Test Python
    vi.mocked(existsSync).mockImplementation((p) => p.toString().endsWith("pyproject.toml"));
    result = await runPostEditSanityChecks({ workspaceRoot: "/workspace", changedFiles: ["main.py"] });
    expect(result.checks.some((c) => c.command.includes("python3 -m py_compile main.py"))).toBe(true);

    // Test Go
    vi.mocked(existsSync).mockImplementation((p) => p.toString().endsWith("go.mod"));
    result = await runPostEditSanityChecks({ workspaceRoot: "/workspace", changedFiles: ["main.go"] });
    expect(result.checks.some((c) => c.command.includes("go test ./..."))).toBe(true);

    // Test Rust
    vi.mocked(existsSync).mockImplementation((p) => p.toString().endsWith("Cargo.toml"));
    result = await runPostEditSanityChecks({ workspaceRoot: "/workspace", changedFiles: ["main.rs"] });
    expect(result.checks.some((c) => c.command.includes("cargo check"))).toBe(true);

    // Test Java Maven
    vi.mocked(existsSync).mockImplementation((p) => p.toString().endsWith("pom.xml"));
    result = await runPostEditSanityChecks({ workspaceRoot: "/workspace", changedFiles: ["Main.java"] });
    expect(result.checks.some((c) => c.command.includes("mvn -q -DskipTests compile"))).toBe(true);
    
    // Test Java Gradle
    vi.mocked(existsSync).mockImplementation((p) => p.toString().endsWith("gradlew"));
    result = await runPostEditSanityChecks({ workspaceRoot: "/workspace", changedFiles: ["Main.java"] });
    expect(result.checks.some((c) => c.command.includes("./gradlew -q classes"))).toBe(true);
  });

  it("detects hidden log blockers that returned zero exit codes", async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
      scripts: { build: "tsc" },
    }));

    vi.mocked(runCommand).mockResolvedValue({
      command: "npm",
      args: ["run", "build"],
      stdout: "File compiled.",
      // A hidden blocker pattern matching `error ts9999`
      stderr: "error TS2322: Type 'string' is not assignable to type 'number'.",
      exitCode: 0, // Malicious 0 exit code
      timedOut: false,
      durationMs: 1,
    });

    const result = await runPostEditSanityChecks({
      workspaceRoot: "/workspace",
      changedFiles: ["a.ts"],
      detectHiddenLogBlockers: true,
    });

    const check = result.checks.find((c) => c.command.includes("npm run --if-present build"));
    expect(check?.status).toBe("failed");
    expect(check?.qaConfigNotes.join("")).toContain("Hidden blocker signatures detected");
  });

  it("executes static relative-import and jsx-props heuristics", async () => {
    // We mock fs.existsSync and fs.readFile to emulate a project with 2 files.
    // a.tsx imports b.tsx and renders it with props, but b.tsx takes no props.
    // a.tsx also imports a fake.tsx that doesn't exist.
    vi.mocked(existsSync).mockImplementation((pStr) => {
      const p = pStr.toString();
      if (p.endsWith("a.tsx")) return true;
      if (p.endsWith("b.tsx")) return true;
      if (p.endsWith("fake.tsx")) return false; // Doesn't exist
      return false;
    });

    vi.mocked(fs.readFile).mockImplementation(async (pStr) => {
      const p = pStr.toString();
      if (p.endsWith("a.tsx")) {
        return `
          import { B } from "./b";
          import { Fake } from "./fake";
          export function A() { return <B brokenProp={true} />; }
        `;
      }
      if (p.endsWith("b.tsx")) {
        return `export const B = () => <div />`;
      }
      return "";
    });

    const result = await runPostEditSanityChecks({
      workspaceRoot: "/workspace",
      changedFiles: ["a.tsx"], // Only process a.tsx statically
    });

    const importsCheck = result.checks.find((c) => c.command.includes("heuristic: relative-import-resolution"));
    expect(importsCheck?.status).toBe("failed");
    expect(importsCheck?.diagnostics?.[0]).toContain("unresolved relative import './fake'");

    const propsCheck = result.checks.find((c) => c.command.includes("heuristic: react-props-contract"));
    expect(propsCheck?.status).toBe("failed");
    expect(propsCheck?.diagnostics?.[0]).toContain("passes props, but");
  });

  it("skips heavy checks if a cheap check fails in scope", async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
      scripts: { lint: "eslint", build: "esbuild" },
    }));

    // Mock lint failing
    vi.mocked(runCommand).mockResolvedValueOnce({
      command: "mock lint",
      args: [],
      stdout: "Lint error in src/app.ts",
      stderr: "",
      exitCode: 1, // failed!
      timedOut: false,
      durationMs: 1,
    });

    const result = await runPostEditSanityChecks({
      workspaceRoot: "/workspace",
      changedFiles: ["src/app.ts"],
      scopeFiles: ["src/app.ts"],
      requireBuildScript: true,
    });

    // Check 1: lint failed
    const lintCheck = result.checks.find((c) => c.category === "cheap");
    expect(lintCheck?.status).toBe("failed");
    
    // Check 2: heavy was skipped due to in scope failure!
    const buildCheck = result.checks.find((c) => c.category === "heavy");
    expect(buildCheck?.status).toBe("skipped");
    expect(result.metrics.heavyChecksSkipped).toBe(1);
    expect(result.metrics.earlyInScopeFailures).toBeGreaterThan(0);
    
    // Ensure failure is reported as blocking
    expect(result.blockingFailureSummaries.length).toBe(1);
  });

  it("reports failure as outOfScope if it did not intersect scopeFiles and is not project wide", async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({})); // No scripts

    // Trigger a heuristic failure (cheap) -> fake relative import finding
    vi.mocked(existsSync).mockImplementation((p) => p.toString().endsWith("src/a.ts"));
    vi.mocked(fs.readFile).mockResolvedValue(`import { Something } from "./fake-module";`);

    const result = await runPostEditSanityChecks({
      workspaceRoot: "/workspace",
      changedFiles: ["src/a.ts"],
      scopeFiles: ["src/isolated.ts"], // Scope is isolated!
    });

    expect(result.metrics.earlyInScopeFailures).toBe(0); // The heuristic failed, but out of scope.
    expect(result.blockingFailureSummaries).toHaveLength(0);
    expect(result.outOfScopeFailureSummaries).toHaveLength(1);
  });
});
