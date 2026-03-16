import path from "node:path";
import { existsSync, promises as fs } from "node:fs";
import { runCommand } from "./workspace-tools.js";
import { unique } from "./text-utils.js";

type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

interface PackageJsonShape {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
}

export interface CodeQualityBootstrapResult {
  notes: string[];
  warnings: string[];
  changedFiles: string[];
}

function hasQualityScript(scripts: Record<string, string>): boolean {
  return Boolean(scripts.lint || scripts.typecheck || scripts.check || scripts.build);
}

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

function hasEslintConfig(workspaceRoot: string): boolean {
  return (
    existsSync(path.join(workspaceRoot, "eslint.config.js"))
    || existsSync(path.join(workspaceRoot, "eslint.config.cjs"))
    || existsSync(path.join(workspaceRoot, ".eslintrc"))
    || existsSync(path.join(workspaceRoot, ".eslintrc.js"))
    || existsSync(path.join(workspaceRoot, ".eslintrc.cjs"))
    || existsSync(path.join(workspaceRoot, ".eslintrc.json"))
  );
}

function hasTypeScriptConfig(workspaceRoot: string): boolean {
  return (
    existsSync(path.join(workspaceRoot, "tsconfig.json"))
    || existsSync(path.join(workspaceRoot, "tsconfig.app.json"))
  );
}

function hasDependency(pkg: PackageJsonShape, dep: string): boolean {
  return Boolean((pkg.devDependencies && pkg.devDependencies[dep]) || (pkg.dependencies && pkg.dependencies[dep]));
}

function hasEslintDependency(pkg: PackageJsonShape): boolean {
  return hasDependency(pkg, "eslint");
}

const ESLINT_CONFIG_JS_TEMPLATE = `module.exports = [
  {
    ignores: ["node_modules/**", "dist/**", "build/**", "coverage/**", ".ai-agents/**"],
  },
  {
    files: ["**/*.{js,jsx,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
    },
  },
];
`;

const ESLINT_CONFIG_TS_TEMPLATE = `const tsParser = require("@typescript-eslint/parser");
const tsPlugin = require("@typescript-eslint/eslint-plugin");

module.exports = [
  {
    ignores: ["node_modules/**", "dist/**", "build/**", "coverage/**", ".ai-agents/**"],
  },
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
    },
  },
];
`;

async function readPackageJson(packageJsonPath: string): Promise<PackageJsonShape | null> {
  try {
    const raw = await fs.readFile(packageJsonPath, "utf8");
    return JSON.parse(raw) as PackageJsonShape;
  } catch {
    return null;
  }
}

function resolveEslintDeps(args: {
  tsProject: boolean;
  pkg: PackageJsonShape;
}): string[] {
  const deps: string[] = [];
  if (!hasDependency(args.pkg, "eslint")) deps.push("eslint");
  if (args.tsProject) {
    if (!hasDependency(args.pkg, "@typescript-eslint/parser")) deps.push("@typescript-eslint/parser");
    if (!hasDependency(args.pkg, "@typescript-eslint/eslint-plugin")) deps.push("@typescript-eslint/eslint-plugin");
    if (!hasDependency(args.pkg, "typescript")) deps.push("typescript");
  }
  return unique(deps);
}

export async function ensureCodeQualityBootstrap(args: {
  workspaceRoot: string;
}): Promise<CodeQualityBootstrapResult> {
  const workspaceRoot = path.resolve(args.workspaceRoot);
  const packageJsonPath = path.join(workspaceRoot, "package.json");
  if (!existsSync(packageJsonPath)) {
    return {
      notes: [],
      warnings: [],
      changedFiles: [],
    };
  }

  let pkg = await readPackageJson(packageJsonPath);
  if (!pkg) {
    return {
      notes: [],
      warnings: ["Code-quality bootstrap skipped: could not parse package.json."],
      changedFiles: [],
    };
  }

  const scripts = { ...(pkg.scripts || {}) };
  const notes: string[] = [];
  const warnings: string[] = [];
  const changedFiles: string[] = [];
  let changed = false;

  const tsProject = hasTypeScriptConfig(workspaceRoot);
  const manager = selectPackageManager(workspaceRoot);

  // If this is a TS project and no code-quality scripts are defined, ensure we at least have typecheck.
  if (tsProject && !hasQualityScript(scripts)) {
    scripts.typecheck = "tsc --noEmit";
    changed = true;
    notes.push("Configured fallback quality script: package.json scripts.typecheck=\"tsc --noEmit\".");
  }

  const shouldTryLintBootstrap = !scripts.lint && !hasEslintDependency(pkg);
  if (shouldTryLintBootstrap) {
    const missingDeps = resolveEslintDeps({
      tsProject,
      pkg,
    });
    if (missingDeps.length) {
      const install = buildInstallCommand(manager, missingDeps);
      const installResult = await runCommand({
        command: install.command,
        commandArgs: install.args,
        cwd: workspaceRoot,
        timeoutMs: 360_000,
        maxOutputChars: 10_000,
      });
      if (installResult.exitCode === 0 && !installResult.timedOut) {
        notes.push(`Installed quality dependencies: ${missingDeps.join(", ")}.`);
        changedFiles.push("package.json");
        const lockFiles = ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb", "bun.lock"];
        for (const lockFile of lockFiles) {
          if (existsSync(path.join(workspaceRoot, lockFile))) changedFiles.push(lockFile);
        }
        pkg = await readPackageJson(packageJsonPath) || pkg;
      } else {
        warnings.push(
          `Failed to install ESLint bootstrap dependencies (${missingDeps.join(", ")}); continuing with available quality checks.`,
        );
      }
    }
  }

  let eslintConfig = hasEslintConfig(workspaceRoot);
  const eslintDependency = hasEslintDependency(pkg);

  if (!eslintConfig && eslintDependency) {
    const configPath = path.join(workspaceRoot, "eslint.config.cjs");
    const template = tsProject ? ESLINT_CONFIG_TS_TEMPLATE : ESLINT_CONFIG_JS_TEMPLATE;
    await fs.writeFile(configPath, template, "utf8");
    eslintConfig = true;
    changedFiles.push("eslint.config.cjs");
    notes.push("Created eslint.config.cjs with a conservative baseline ruleset.");
  }

  // If ESLint is available in the repo but lint script is missing, configure it.
  if (!scripts.lint && eslintConfig && eslintDependency) {
    scripts.lint = "eslint .";
    changed = true;
    notes.push('Configured lint script: package.json scripts.lint="eslint .".');
  }

  if (!scripts.lint && !scripts.typecheck && !scripts.check && !scripts.build) {
    warnings.push("No lint/typecheck/check/build scripts are configured; language-aware fallback checks will be used.");
  }

  if (!changed) {
    return {
      notes: unique(notes),
      warnings: unique(warnings),
      changedFiles: unique(changedFiles),
    };
  }

  const updated: PackageJsonShape = {
    ...pkg,
    scripts,
  };
  await fs.writeFile(packageJsonPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  changedFiles.push("package.json");

  return {
    notes: unique(notes),
    warnings: unique(warnings),
    changedFiles: unique(changedFiles),
  };
}
