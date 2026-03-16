import path from "node:path";
import { existsSync, promises as fs } from "node:fs";
import { exists } from "./fs.js";
import { unique } from "./text-utils.js";
import { runCommand, type ValidationCheckResult } from "./workspace-tools.js";

type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

interface PackageJsonShape {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface QaCypressBootstrapResult {
  checks: ValidationCheckResult[];
  notes: string[];
  warnings: string[];
  changedFiles: string[];
}

const CYPRESS_CONFIG_TS_PATH = "cypress.config.ts";
const CYPRESS_SUPPORT_E2E_PATH = "cypress/support/e2e.ts";
const CYPRESS_RUN_SCRIPT = "cypress run --config-file cypress.config.ts";
const CYPRESS_CONFIG_TEMPLATE = `import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL || "http://localhost:5173",
    specPattern: ["cypress/e2e/**/*.cy.{js,jsx,ts,tsx}", "e2e/**/*.cy.{js,jsx,ts,tsx}"],
    supportFile: "cypress/support/e2e.ts",
    setupNodeEvents() {},
  },
  video: false,
  screenshotOnRunFailure: false,
});
`;
const CYPRESS_SUPPORT_E2E_TEMPLATE = `// QA bootstrap: default Cypress support entry.
export {};
`;

function selectPackageManager(workspaceRoot: string): PackageManager {
  if (existsSync(path.join(workspaceRoot, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(path.join(workspaceRoot, "yarn.lock"))) return "yarn";
  if (existsSync(path.join(workspaceRoot, "bun.lockb")) || existsSync(path.join(workspaceRoot, "bun.lock"))) return "bun";
  return "npm";
}

function buildInstallCommand(manager: PackageManager, deps: string[]): { command: string; args: string[] } {
  switch (manager) {
    case "pnpm":
      return { command: "pnpm", args: ["add", "-D", ...deps] };
    case "yarn":
      return { command: "yarn", args: ["add", "-D", ...deps] };
    case "bun":
      return { command: "bun", args: ["add", "-d", ...deps] };
    case "npm":
    default:
      return { command: "npm", args: ["install", "--save-dev", ...deps] };
  }
}

function extractDiagnostics(stdout: string, stderr: string): string[] {
  const combined = `${stdout}\n${stderr}`;
  const out: string[] = [];
  for (const rawLine of combined.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line) continue;
    if (!/\b(error|failed|cannot|not found|invalid|timed out|enoent)\b/i.test(line)) continue;
    out.push(line.length > 220 ? `${line.slice(0, 219)}…` : line);
    if (out.length >= 6) break;
  }
  return unique(out);
}

function toCheckResult(args: {
  label: string;
  result: Awaited<ReturnType<typeof runCommand>>;
  notes?: string[];
}): ValidationCheckResult {
  return {
    command: args.label,
    status: args.result.exitCode === 0 && !args.result.timedOut ? "passed" : "failed",
    exitCode: args.result.exitCode,
    timedOut: args.result.timedOut,
    durationMs: args.result.durationMs,
    stdoutPreview: args.result.stdout.slice(0, 1200),
    stderrPreview: args.result.stderr.slice(0, 1200),
    diagnostics: extractDiagnostics(args.result.stdout, args.result.stderr),
    qaConfigNotes: args.notes || [],
    artifacts: [],
  };
}

async function readPackageJson(workspaceRoot: string): Promise<{ path: string; data: PackageJsonShape | null; warning?: string }> {
  const packageJsonPath = path.join(workspaceRoot, "package.json");
  if (!(await exists(packageJsonPath))) {
    return {
      path: packageJsonPath,
      data: null,
      warning: "package.json not found; QA could not bootstrap Cypress automatically.",
    };
  }

  try {
    const raw = await fs.readFile(packageJsonPath, "utf8");
    return {
      path: packageJsonPath,
      data: JSON.parse(raw) as PackageJsonShape,
    };
  } catch {
    return {
      path: packageJsonPath,
      data: null,
      warning: "package.json is invalid JSON; QA could not bootstrap Cypress automatically.",
    };
  }
}

function hasDependency(pkg: PackageJsonShape, dep: string): boolean {
  return Boolean(pkg.dependencies?.[dep] || pkg.devDependencies?.[dep]);
}

export async function ensureQaCypressBootstrap(args: {
  workspaceRoot: string;
}): Promise<QaCypressBootstrapResult> {
  const workspaceRoot = path.resolve(args.workspaceRoot);
  const checks: ValidationCheckResult[] = [];
  const notes: string[] = [];
  const warnings: string[] = [];
  const changedFiles: string[] = [];
  const manager = selectPackageManager(workspaceRoot);

  const initialPackageJson = await readPackageJson(workspaceRoot);
  if (!initialPackageJson.data) {
    if (initialPackageJson.warning) warnings.push(initialPackageJson.warning);
    return { checks, notes, warnings, changedFiles };
  }

  const initialMissingDeps = [
    !hasDependency(initialPackageJson.data, "cypress") ? "cypress" : "",
    !hasDependency(initialPackageJson.data, "@types/mocha") ? "@types/mocha" : "",
  ].filter(Boolean);

  if (initialMissingDeps.length) {
    const install = buildInstallCommand(manager, initialMissingDeps);
    const installResult = await runCommand({
      command: install.command,
      commandArgs: install.args,
      cwd: workspaceRoot,
      timeoutMs: 480_000,
      maxOutputChars: 12_000,
    });
    checks.push(toCheckResult({
      label: "qa bootstrap: install test dependencies",
      result: installResult,
      notes: [
        `Installed missing test dependencies: ${initialMissingDeps.join(", ")}.`,
      ],
    }));

    if (installResult.exitCode === 0 && !installResult.timedOut) {
      notes.push(`QA installed missing test dependencies: ${initialMissingDeps.join(", ")}.`);
    } else {
      warnings.push(`Failed to install test dependencies (${initialMissingDeps.join(", ")}).`);
    }
  }

  const latestPackageJson = await readPackageJson(workspaceRoot);
  if (!latestPackageJson.data) {
    if (latestPackageJson.warning) warnings.push(latestPackageJson.warning);
    return {
      checks,
      notes: unique(notes),
      warnings: unique(warnings),
      changedFiles: unique(changedFiles),
    };
  }

  const pkg = latestPackageJson.data;
  const scripts = pkg.scripts || {};
  let packageJsonChanged = false;

  if (!scripts["cypress:run"]) {
    scripts["cypress:run"] = CYPRESS_RUN_SCRIPT;
    packageJsonChanged = true;
    notes.push('Added package script "cypress:run" for QA E2E execution.');
  }

  if (packageJsonChanged) {
    pkg.scripts = scripts;
    await fs.writeFile(latestPackageJson.path, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
    changedFiles.push("package.json");
  }

  const cypressConfigPath = path.join(workspaceRoot, CYPRESS_CONFIG_TS_PATH);
  if (!(await exists(cypressConfigPath))) {
    await fs.writeFile(cypressConfigPath, CYPRESS_CONFIG_TEMPLATE, "utf8");
    changedFiles.push(CYPRESS_CONFIG_TS_PATH);
    notes.push("Created cypress.config.ts with baseUrl/specPattern/supportFile for QA execution.");
  } else {
    const raw = await fs.readFile(cypressConfigPath, "utf8").catch(() => "");
    const hasBaseUrl = /\bbaseUrl\s*:\s*/.test(raw);
    const hasSpecPattern = /\bspecPattern\s*:\s*/.test(raw);
    const hasSupportFile = /\bsupportFile\s*:\s*/.test(raw);
    if (!hasBaseUrl || !hasSpecPattern || !hasSupportFile) {
      await fs.writeFile(cypressConfigPath, CYPRESS_CONFIG_TEMPLATE, "utf8");
      changedFiles.push(CYPRESS_CONFIG_TS_PATH);
      notes.push("Normalized cypress.config.ts to include baseUrl/specPattern/supportFile for QA.");
    }
  }

  const cypressSupportPath = path.join(workspaceRoot, CYPRESS_SUPPORT_E2E_PATH);
  if (!(await exists(cypressSupportPath))) {
    await fs.mkdir(path.dirname(cypressSupportPath), { recursive: true });
    await fs.writeFile(cypressSupportPath, CYPRESS_SUPPORT_E2E_TEMPLATE, "utf8");
    changedFiles.push(CYPRESS_SUPPORT_E2E_PATH);
    notes.push("Created Cypress support file at cypress/support/e2e.ts for stable QA runs.");
  }

  return {
    checks,
    notes: unique(notes),
    warnings: unique(warnings),
    changedFiles: unique(changedFiles),
  };
}
