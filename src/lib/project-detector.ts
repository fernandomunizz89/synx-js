import path from "node:path";
import { existsSync, promises as fs } from "node:fs";
import { type TestCapabilities, detectTestCapabilities } from "./workspace-tools.js";
import { unique } from "./text-utils.js";
import type { ResolvedProjectConfig } from "./types.js";

export const IGNORED_DIRS = new Set([
  ".git",
  ".ai-agents",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
  "out",
]);

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export interface PackageJsonShape {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface ProjectProfile {
  generatedAt: string;
  workspaceRoot: string;
  taskTitle: string;
  taskType: string;
  configuredProject: {
    projectName: string;
    language: string;
    framework: string;
  };
  packageManager: PackageManager;
  scripts: Record<string, string>;
  scriptSummary: {
    lint: string[];
    typecheck: string[];
    check: string[];
    test: string[];
    e2e: string[];
    build: string[];
  };
  testCapabilities: TestCapabilities;
  detectedLanguages: string[];
  detectedFrameworks: string[];
  dependencies: string[];
  tooling: {
    hasTsConfig: boolean;
    hasPlaywrightConfig: boolean;
    hasEslintConfig: boolean;
  };
  sourceLayout: {
    hasSrcDir: boolean;
    hasE2EDir: boolean;
    sampleSourceFiles: string[];
    sampleTestFiles: string[];
    keyFiles: string[];
  };
}

export function selectPackageManager(workspaceRoot: string): PackageManager {
  if (existsSync(path.join(workspaceRoot, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(path.join(workspaceRoot, "yarn.lock"))) return "yarn";
  if (existsSync(path.join(workspaceRoot, "bun.lockb")) || existsSync(path.join(workspaceRoot, "bun.lock"))) return "bun";
  return "npm";
}

export async function readPackageJson(workspaceRoot: string): Promise<PackageJsonShape> {
  const packageJsonPath = path.join(workspaceRoot, "package.json");
  try {
    const raw = await fs.readFile(packageJsonPath, "utf8");
    return JSON.parse(raw) as PackageJsonShape;
  } catch {
    return {};
  }
}

export async function walkFiles(root: string, maxFiles = 1200): Promise<string[]> {
  const out: string[] = [];

  async function walk(current: string): Promise<void> {
    if (out.length >= maxFiles) return;
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (out.length >= maxFiles) break;
      const absolutePath = path.join(current, entry.name);
      const relativePath = path.relative(root, absolutePath).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        await walk(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      out.push(relativePath);
    }
  }

  await walk(root);
  return out.sort();
}

export function detectLanguages(files: string[]): string[] {
  const ext = new Map<string, number>();
  for (const file of files) {
    const match = file.toLowerCase().match(/\.([a-z0-9]+)$/);
    if (!match) continue;
    const key = match[1];
    ext.set(key, (ext.get(key) || 0) + 1);
  }

  const out: string[] = [];
  if ((ext.get("ts") || 0) + (ext.get("tsx") || 0) > 0) out.push("TypeScript");
  if ((ext.get("js") || 0) + (ext.get("jsx") || 0) > 0) out.push("JavaScript");
  if ((ext.get("py") || 0) > 0) out.push("Python");
  if ((ext.get("go") || 0) > 0) out.push("Go");
  if ((ext.get("rs") || 0) > 0) out.push("Rust");
  if ((ext.get("java") || 0) > 0) out.push("Java");
  if ((ext.get("kt") || 0) > 0) out.push("Kotlin");
  if ((ext.get("rb") || 0) > 0) out.push("Ruby");
  if ((ext.get("php") || 0) > 0) out.push("PHP");
  return out;
}

export function detectFrameworksFromDeps(dependencies: string[]): string[] {
  const depSet = new Set(dependencies.map((x) => x.toLowerCase()));
  const frameworks: string[] = [];
  if (depSet.has("react")) frameworks.push("React");
  if (depSet.has("next")) frameworks.push("Next.js");
  if (depSet.has("vue")) frameworks.push("Vue");
  if (depSet.has("nuxt")) frameworks.push("Nuxt");
  if (depSet.has("svelte")) frameworks.push("Svelte");
  if (depSet.has("@angular/core")) frameworks.push("Angular");
  if (depSet.has("vite")) frameworks.push("Vite");
  if (depSet.has("express")) frameworks.push("Express");
  if (depSet.has("fastify")) frameworks.push("Fastify");
  if (depSet.has("@nestjs/core")) frameworks.push("NestJS");
  if (depSet.has("@playwright/test")) frameworks.push("Playwright");
  return frameworks;
}

export function summarizeScripts(scripts: Record<string, string>): ProjectProfile["scriptSummary"] {
  const names = Object.keys(scripts);
  return {
    lint: names.filter((x) => /lint/i.test(x)),
    typecheck: names.filter((x) => /typecheck|tsc|check-types/i.test(x)),
    check: names.filter((x) => /^check$|check:/i.test(x)),
    test: names.filter((x) => /^test$|test:/i.test(x)),
    e2e: names.filter((x) => /e2e|playwright/i.test(x)),
    build: names.filter((x) => /build/i.test(x)),
  };
}

export async function collectProjectProfile(args: {
  workspaceRoot: string;
  taskTitle: string;
  taskType: string;
  config: ResolvedProjectConfig;
}): Promise<ProjectProfile> {
  const workspaceRoot = path.resolve(args.workspaceRoot);
  const packageJson = await readPackageJson(workspaceRoot);
  const scripts = packageJson.scripts || {};
  const dependencies = unique([
    ...Object.keys(packageJson.dependencies || {}),
    ...Object.keys(packageJson.devDependencies || {}),
  ]);
  const files = await walkFiles(workspaceRoot, 1400);
  const testCapabilities = await detectTestCapabilities(workspaceRoot);

  const sourceFiles = files.filter((x) => /^src\/.+\.(ts|tsx|js|jsx)$/i.test(x)).slice(0, 12);
  const testFiles = files.filter((x) => /(\/__tests__\/|\.test\.|\.spec\.|^e2e\/)/i.test(x)).slice(0, 12);
  const keyFiles = unique([
    "package.json",
    existsSync(path.join(workspaceRoot, "tsconfig.json")) ? "tsconfig.json" : "",
    existsSync(path.join(workspaceRoot, "vite.config.ts")) ? "vite.config.ts" : "",
    existsSync(path.join(workspaceRoot, "playwright.config.ts")) ? "playwright.config.ts" : "",
  ]);

  return {
    generatedAt: new Date().toISOString(),
    workspaceRoot,
    taskTitle: args.taskTitle,
    taskType: args.taskType,
    configuredProject: {
      projectName: args.config.projectName,
      language: args.config.language,
      framework: args.config.framework,
    },
    packageManager: selectPackageManager(workspaceRoot),
    scripts,
    scriptSummary: summarizeScripts(scripts),
    testCapabilities,
    detectedLanguages: detectLanguages(files),
    detectedFrameworks: detectFrameworksFromDeps(dependencies),
    dependencies: dependencies.slice(0, 80),
    tooling: {
      hasTsConfig: existsSync(path.join(workspaceRoot, "tsconfig.json")),
      hasPlaywrightConfig: existsSync(path.join(workspaceRoot, "playwright.config.ts")) || existsSync(path.join(workspaceRoot, "playwright.config.js")),
      hasEslintConfig: existsSync(path.join(workspaceRoot, "eslint.config.js")) || existsSync(path.join(workspaceRoot, ".eslintrc")) || existsSync(path.join(workspaceRoot, ".eslintrc.js")),
    },
    sourceLayout: {
      hasSrcDir: existsSync(path.join(workspaceRoot, "src")),
      hasE2EDir: existsSync(path.join(workspaceRoot, "e2e")),
      sampleSourceFiles: sourceFiles,
      sampleTestFiles: testFiles,
      keyFiles,
    },
  };
}
