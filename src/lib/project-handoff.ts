import path from "node:path";
import { existsSync, promises as fs } from "node:fs";
import type { ResolvedProjectConfig } from "./types.js";
import { runCommand, type TestCapabilities, detectTestCapabilities } from "./workspace-tools.js";
import { unique } from "./text-utils.js";

const IGNORED_DIRS = new Set([
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

type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

interface PackageJsonShape {
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
    hasCypressConfig: boolean;
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

export interface InvestigationCheck {
  command: string;
  status: "passed" | "failed";
  exitCode: number | null;
  durationMs: number;
  diagnostics: string[];
}

export interface BugBrief {
  generatedAt: string;
  symptomSummary: string;
  likelyRootCauses: string[];
  reproductionEvidence: string[];
  triageChecks: InvestigationCheck[];
  quickWins: string[];
  blockerPatterns: string[];
  suspectFiles: string[];
  suspectAreas: string[];
  primaryHypothesis: string;
  secondaryHypotheses: string[];
  builderChecks: string[];
  riskAssessment: {
    buildRisk: "low" | "medium" | "high" | "unknown";
    syntaxRisk: "low" | "medium" | "high" | "unknown";
    logicRisk: "low" | "medium" | "high" | "unknown";
    integrationRisk: "low" | "medium" | "high" | "unknown";
    regressionRisk: "low" | "medium" | "high" | "unknown";
  };
  handoffNotes: string[];
}

export interface SymbolContract {
  sourceMessage: string;
  modulePath: string;
  symbol: string;
  importerPath: string;
  observedExports: {
    named: string[];
    hasDefault: boolean;
  };
  observedImportStatements: string[];
  expectedImportShape: string;
  mismatchSummary: string;
  confidence: "high" | "medium" | "low";
}

function selectPackageManager(workspaceRoot: string): PackageManager {
  if (existsSync(path.join(workspaceRoot, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(path.join(workspaceRoot, "yarn.lock"))) return "yarn";
  if (existsSync(path.join(workspaceRoot, "bun.lockb")) || existsSync(path.join(workspaceRoot, "bun.lock"))) return "bun";
  return "npm";
}

async function readPackageJson(workspaceRoot: string): Promise<PackageJsonShape> {
  const packageJsonPath = path.join(workspaceRoot, "package.json");
  try {
    const raw = await fs.readFile(packageJsonPath, "utf8");
    return JSON.parse(raw) as PackageJsonShape;
  } catch {
    return {};
  }
}

async function walkFiles(root: string, maxFiles = 1200): Promise<string[]> {
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

function detectLanguages(files: string[]): string[] {
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

function detectFrameworksFromDeps(dependencies: string[]): string[] {
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
  if (depSet.has("cypress")) frameworks.push("Cypress");
  if (depSet.has("@playwright/test")) frameworks.push("Playwright");
  return frameworks;
}

function summarizeScripts(scripts: Record<string, string>): ProjectProfile["scriptSummary"] {
  const names = Object.keys(scripts);
  return {
    lint: names.filter((x) => /lint/i.test(x)),
    typecheck: names.filter((x) => /typecheck|tsc|check-types/i.test(x)),
    check: names.filter((x) => /^check$|check:/i.test(x)),
    test: names.filter((x) => /^test$|test:/i.test(x)),
    e2e: names.filter((x) => /e2e|cypress|playwright/i.test(x)),
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
  const testFiles = files.filter((x) => /(\/__tests__\/|\.test\.|\.spec\.|^e2e\/|cypress\/e2e\/)/i.test(x)).slice(0, 12);
  const keyFiles = unique([
    "package.json",
    existsSync(path.join(workspaceRoot, "tsconfig.json")) ? "tsconfig.json" : "",
    existsSync(path.join(workspaceRoot, "vite.config.ts")) ? "vite.config.ts" : "",
    existsSync(path.join(workspaceRoot, "cypress.config.ts")) ? "cypress.config.ts" : "",
    existsSync(path.join(workspaceRoot, "cypress.config.cjs")) ? "cypress.config.cjs" : "",
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
      hasCypressConfig: existsSync(path.join(workspaceRoot, "cypress.config.ts")) || existsSync(path.join(workspaceRoot, "cypress.config.cjs")),
      hasPlaywrightConfig: existsSync(path.join(workspaceRoot, "playwright.config.ts")) || existsSync(path.join(workspaceRoot, "playwright.config.js")),
      hasEslintConfig: existsSync(path.join(workspaceRoot, "eslint.config.js")) || existsSync(path.join(workspaceRoot, ".eslintrc")) || existsSync(path.join(workspaceRoot, ".eslintrc.js")),
    },
    sourceLayout: {
      hasSrcDir: existsSync(path.join(workspaceRoot, "src")),
      hasE2EDir: existsSync(path.join(workspaceRoot, "e2e")) || existsSync(path.join(workspaceRoot, "cypress", "e2e")),
      sampleSourceFiles: sourceFiles,
      sampleTestFiles: testFiles,
      keyFiles,
    },
  };
}

function buildManagerScriptCommand(manager: PackageManager, script: string): { command: string; args: string[] } {
  switch (manager) {
    case "pnpm":
      return { command: "pnpm", args: ["run", "--if-present", script] };
    case "yarn":
      return { command: "yarn", args: ["run", script] };
    case "bun":
      return { command: "bun", args: ["run", script] };
    case "npm":
    default:
      return { command: "npm", args: ["run", "--if-present", script] };
  }
}

function extractDiagnostics(stdout: string, stderr: string): string[] {
  const combined = `${stdout}\n${stderr}`;
  const out: string[] = [];
  for (const rawLine of combined.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line) continue;
    if (!/\b(error|failed|cannot|syntax|typeerror|referenceerror|ts\d{4}|exception)\b/i.test(line)) continue;
    out.push(line.length > 220 ? `${line.slice(0, 219)}…` : line);
    if (out.length >= 8) break;
  }
  return unique(out);
}

function typeScriptNoEmitCommand(manager: PackageManager): { command: string; args: string[]; label: string } {
  switch (manager) {
    case "pnpm":
      return { command: "pnpm", args: ["exec", "tsc", "--noEmit"], label: "pnpm exec tsc --noEmit" };
    case "yarn":
      return { command: "yarn", args: ["tsc", "--noEmit"], label: "yarn tsc --noEmit" };
    case "bun":
      return { command: "bunx", args: ["tsc", "--noEmit"], label: "bunx tsc --noEmit" };
    case "npm":
    default:
      return { command: "npx", args: ["tsc", "--noEmit"], label: "npx tsc --noEmit" };
  }
}

export async function runBugTriageChecks(args: {
  workspaceRoot: string;
  profile: ProjectProfile;
  maxCommands?: number;
}): Promise<InvestigationCheck[]> {
  const commands: Array<{ command: string; args: string[]; label: string }> = [];
  const maxCommands = args.maxCommands ?? 3;
  const manager = args.profile.packageManager;

  if (args.profile.scriptSummary.typecheck.length) {
    commands.push({
      ...buildManagerScriptCommand(manager, args.profile.scriptSummary.typecheck[0]),
      label: `${buildManagerScriptCommand(manager, args.profile.scriptSummary.typecheck[0]).command} ${buildManagerScriptCommand(manager, args.profile.scriptSummary.typecheck[0]).args.join(" ")}`,
    });
  } else if (args.profile.tooling.hasTsConfig) {
    commands.push(typeScriptNoEmitCommand(manager));
  }

  if (args.profile.scriptSummary.lint.length) {
    const lint = args.profile.scriptSummary.lint[0];
    const cmd = buildManagerScriptCommand(manager, lint);
    commands.push({ ...cmd, label: `${cmd.command} ${cmd.args.join(" ")}` });
  } else if (args.profile.scriptSummary.check.length) {
    const check = args.profile.scriptSummary.check[0];
    const cmd = buildManagerScriptCommand(manager, check);
    commands.push({ ...cmd, label: `${cmd.command} ${cmd.args.join(" ")}` });
  }

  const results: InvestigationCheck[] = [];
  for (const command of commands.slice(0, maxCommands)) {
    const result = await runCommand({
      command: command.command,
      commandArgs: command.args,
      cwd: args.workspaceRoot,
      timeoutMs: 150_000,
      maxOutputChars: 8_000,
    });
    results.push({
      command: command.label,
      status: result.exitCode === 0 && !result.timedOut ? "passed" : "failed",
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      diagnostics: extractDiagnostics(result.stdout, result.stderr),
    });
  }

  return results;
}

function textFromUnknown(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function arrayFromUnknown(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean);
}

function riskFromUnknown(value: unknown): "low" | "medium" | "high" | "unknown" {
  const normalized = textFromUnknown(value).toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high" || normalized === "unknown") {
    return normalized;
  }
  return "unknown";
}

export function buildBugBrief(args: {
  taskTitle: string;
  rawRequest: string;
  dispatcherOutput: unknown;
  investigatorOutput: unknown;
  triageChecks: InvestigationCheck[];
}): BugBrief {
  const dispatcher = (args.dispatcherOutput && typeof args.dispatcherOutput === "object")
    ? args.dispatcherOutput as Record<string, unknown>
    : {};
  const investigator = (args.investigatorOutput && typeof args.investigatorOutput === "object")
    ? args.investigatorOutput as Record<string, unknown>
    : {};

  const likelyRootCauses = unique([
    ...arrayFromUnknown(investigator.likelyCauses),
    ...arrayFromUnknown(dispatcher.assumptions),
  ]).slice(0, 10);

  const reproductionEvidence = unique([
    args.rawRequest,
    ...arrayFromUnknown(investigator.knownFacts),
    ...args.triageChecks.map((check) => {
      const diag = check.diagnostics[0] || "no diagnostics";
      return `${check.command} => ${check.status} (exit=${check.exitCode ?? "null"}) | ${diag}`;
    }),
  ]).slice(0, 14);

  const quickWins = unique([
    ...arrayFromUnknown(investigator.investigationSteps),
    ...arrayFromUnknown(dispatcher.constraints),
  ]).slice(0, 10);

  const blockerPatterns = unique(
    reproductionEvidence
      .filter((item) => /(does not provide an export named|ts\d{4}|syntaxerror|typeerror|cypress|selector|baseurl|specpattern)/i.test(item))
      .slice(0, 10),
  );
  const suspectFiles = arrayFromUnknown(investigator.suspectFiles).slice(0, 16);
  const suspectAreas = arrayFromUnknown(investigator.suspectAreas).slice(0, 12);
  const primaryHypothesis = textFromUnknown(investigator.primaryHypothesis) || likelyRootCauses[0] || args.taskTitle;
  const secondaryHypotheses = arrayFromUnknown(investigator.secondaryHypotheses).slice(0, 8);
  const builderChecks = arrayFromUnknown(investigator.builderChecks).slice(0, 10);
  const handoffNotes = arrayFromUnknown(investigator.handoffNotes).slice(0, 8);
  const riskAssessmentRaw = (investigator.riskAssessment && typeof investigator.riskAssessment === "object")
    ? investigator.riskAssessment as Record<string, unknown>
    : {};
  const riskAssessment = {
    buildRisk: riskFromUnknown(riskAssessmentRaw.buildRisk),
    syntaxRisk: riskFromUnknown(riskAssessmentRaw.syntaxRisk),
    logicRisk: riskFromUnknown(riskAssessmentRaw.logicRisk),
    integrationRisk: riskFromUnknown(riskAssessmentRaw.integrationRisk),
    regressionRisk: riskFromUnknown(riskAssessmentRaw.regressionRisk),
  };

  return {
    generatedAt: new Date().toISOString(),
    symptomSummary: textFromUnknown(investigator.symptomSummary) || args.taskTitle,
    likelyRootCauses,
    reproductionEvidence,
    triageChecks: args.triageChecks,
    quickWins,
    blockerPatterns,
    suspectFiles,
    suspectAreas,
    primaryHypothesis,
    secondaryHypotheses,
    builderChecks,
    riskAssessment,
    handoffNotes,
  };
}

function parseExportInfo(source: string): { named: string[]; hasDefault: boolean } {
  const named: string[] = [];
  const namedDeclaration = /export\s+(?:const|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;
  let match: RegExpExecArray | null;
  while ((match = namedDeclaration.exec(source))) {
    named.push(match[1]);
  }
  const namedList = /export\s*{\s*([^}]+)\s*}/g;
  while ((match = namedList.exec(source))) {
    const body = match[1];
    for (const token of body.split(",")) {
      const normalized = token.trim().split(/\s+as\s+/i)[0]?.trim();
      if (normalized) named.push(normalized);
    }
  }
  return {
    named: unique(named),
    hasDefault: /export\s+default\b/.test(source),
  };
}

async function findFileByBasename(workspaceRoot: string, baseName: string): Promise<string> {
  const files = await walkFiles(workspaceRoot, 1800);
  const match = files.find((file) => file.endsWith(`/${baseName}`) || file === baseName);
  return match || "";
}

async function readFileIfExists(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

function resolveImportSpecifierPath(importerPath: string, specifier: string): string[] {
  if (!specifier.startsWith(".")) return [];
  const base = path.resolve(path.dirname(importerPath), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
    path.join(base, "index.js"),
    path.join(base, "index.jsx"),
  ];
  return candidates;
}

export async function deriveSymbolContracts(args: {
  workspaceRoot: string;
  sourceTexts: string[];
}): Promise<SymbolContract[]> {
  const contracts: SymbolContract[] = [];
  const regex = /requested module ['"]([^'"]+)['"] does not provide an export named ['"]([^'"]+)['"]/gi;
  const locationRegex = /\(at\s+([^:()]+):(\d+):(\d+)\)/i;
  const seen = new Set<string>();

  for (const sourceText of args.sourceTexts) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(sourceText))) {
      const moduleRaw = match[1];
      const symbol = match[2];
      const key = `${moduleRaw}::${symbol}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const locationMatch = sourceText.match(locationRegex);
      const importerBaseName = locationMatch?.[1] || "";
      const importerPath = importerBaseName ? await findFileByBasename(args.workspaceRoot, importerBaseName) : "";
      const modulePathRelative = moduleRaw.startsWith("/") ? moduleRaw.slice(1) : moduleRaw.replace(/^\.\//, "");
      const modulePathAbsolute = path.join(args.workspaceRoot, modulePathRelative);
      const moduleSource = await readFileIfExists(modulePathAbsolute);
      const exportInfo = parseExportInfo(moduleSource);

      let observedImportStatements: string[] = [];
      let expectedImportShape = `import { ${symbol} } from "<module-path>"`;
      let mismatchSummary = `Module "${modulePathRelative}" does not expose named export "${symbol}".`;
      let confidence: "high" | "medium" | "low" = "medium";

      if (importerPath) {
        const importerAbsolute = path.join(args.workspaceRoot, importerPath);
        const importerSource = await readFileIfExists(importerAbsolute);
        const importRegex = /^\s*import\s+(.+?)\s+from\s+['"]([^'"]+)['"]/gm;
        const importMatches: string[] = [];
        let importMatch: RegExpExecArray | null;
        while ((importMatch = importRegex.exec(importerSource))) {
          const importClause = importMatch[1].trim();
          const specifier = importMatch[2].trim();
          const resolvedCandidates = resolveImportSpecifierPath(importerAbsolute, specifier)
            .map((candidate) => path.resolve(candidate));
          const moduleAbs = path.resolve(modulePathAbsolute);
          const isTarget = resolvedCandidates.some((candidate) => candidate === moduleAbs);
          if (!isTarget && !specifier.includes(moduleRaw.replace(/^\/+/, ""))) continue;
          importMatches.push(`import ${importClause} from "${specifier}"`);
          if (!expectedImportShape.includes("<module-path>")) continue;
          expectedImportShape = `import { ${symbol} } from "${specifier}"`;
        }
        observedImportStatements = importMatches.slice(0, 4);
      }

      if (exportInfo.named.includes(symbol)) {
        mismatchSummary = observedImportStatements.some((line) => /^import\s+\{/.test(line))
          ? `Named export "${symbol}" exists and import shape looks compatible. Re-check runtime path resolution.`
          : `Named export "${symbol}" exists; importer should use named import syntax.`;
        confidence = "high";
      } else if (exportInfo.hasDefault) {
        mismatchSummary = `Module exports default but not named "${symbol}". Importer should either use default import or module should add named export "${symbol}".`;
        confidence = "high";
      }

      contracts.push({
        sourceMessage: sourceText.slice(0, 240),
        modulePath: modulePathRelative,
        symbol,
        importerPath,
        observedExports: exportInfo,
        observedImportStatements,
        expectedImportShape,
        mismatchSummary,
        confidence,
      });
    }
  }

  return contracts;
}

export function projectProfileFactLines(profile: ProjectProfile): string[] {
  return unique([
    `Project profile: manager=${profile.packageManager}, languages=${profile.detectedLanguages.join(", ") || "unknown"}, frameworks=${profile.detectedFrameworks.join(", ") || "unknown"}.`,
    `Scripts: lint=${profile.scriptSummary.lint.join(", ") || "[none]"} | typecheck=${profile.scriptSummary.typecheck.join(", ") || "[none]"} | e2e=${profile.scriptSummary.e2e.join(", ") || "[none]"}.`,
    `Tooling: tsconfig=${profile.tooling.hasTsConfig ? "yes" : "no"}, cypressConfig=${profile.tooling.hasCypressConfig ? "yes" : "no"}, playwrightConfig=${profile.tooling.hasPlaywrightConfig ? "yes" : "no"}.`,
  ]);
}

export function bugBriefFactLines(brief: BugBrief): string[] {
  return unique([
    `Bug brief: ${brief.symptomSummary}`,
    `Primary hypothesis: ${brief.primaryHypothesis}`,
    `Suspect files: ${brief.suspectFiles.slice(0, 5).join(", ") || "[none identified]"}.`,
    ...brief.triageChecks.map((check) => `${check.command} => ${check.status} (exit=${check.exitCode ?? "null"})`),
    ...brief.blockerPatterns.slice(0, 3),
    ...brief.builderChecks.slice(0, 2),
  ]).slice(0, 8);
}

export function symbolContractFactLines(contracts: SymbolContract[]): string[] {
  return contracts.slice(0, 6).map((contract) => {
    return `Symbol contract: ${contract.symbol} in ${contract.modulePath} | importer=${contract.importerPath || "[unknown]"} | ${contract.mismatchSummary}`;
  });
}
