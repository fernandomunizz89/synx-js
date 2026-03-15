import path from "node:path";
import { existsSync, promises as fs } from "node:fs";
import { runCommand, type ValidationCheckResult } from "./workspace-tools.js";

type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

interface PackageJsonShape {
  scripts?: Record<string, string>;
}

export interface PostEditSanityResult {
  checks: ValidationCheckResult[];
  failureSummaries: string[];
  blockingFailureSummaries: string[];
  outOfScopeFailureSummaries: string[];
  metrics: {
    plannedChecks: number;
    executedChecks: number;
    cheapChecksExecuted: number;
    heavyChecksExecuted: number;
    fullBuildChecksExecuted: number;
    heavyChecksSkipped: number;
    earlyInScopeFailures: number;
  };
}

interface SanityCommand {
  label: string;
  command: string;
  args: string[];
  note: string;
  category: "cheap" | "heavy";
  isFullBuild?: boolean;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((x) => x.trim()).filter(Boolean)));
}

function selectPackageManager(workspaceRoot: string): PackageManager {
  if (existsSync(path.join(workspaceRoot, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(path.join(workspaceRoot, "yarn.lock"))) return "yarn";
  if (existsSync(path.join(workspaceRoot, "bun.lockb")) || existsSync(path.join(workspaceRoot, "bun.lock"))) return "bun";
  return "npm";
}

function buildScriptCommand(
  manager: PackageManager,
  script: string,
): { command: string; args: string[] } {
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

async function readPackageScripts(workspaceRoot: string): Promise<Record<string, string>> {
  const packageJsonPath = path.join(workspaceRoot, "package.json");
  try {
    const raw = await fs.readFile(packageJsonPath, "utf8");
    const parsed = JSON.parse(raw) as PackageJsonShape;
    return parsed.scripts || {};
  } catch {
    return {};
  }
}

function looksLikeCodeFile(filePath: string): boolean {
  const normalized = filePath.toLowerCase();
  return /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(normalized) || normalized.endsWith("package.json");
}

function extractDiagnostics(stdout: string, stderr: string): string[] {
  const combined = `${stdout}\n${stderr}`;
  const out: string[] = [];
  for (const rawLine of combined.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line) continue;
    if (!/\b(error|failed|cannot|not found|syntax|typeerror|referenceerror|ts\d{4})\b/i.test(line)) continue;
    out.push(line.length > 220 ? `${line.slice(0, 219)}…` : line);
    if (out.length >= 6) break;
  }
  return unique(out);
}

function extractHiddenLogBlockers(stdout: string, stderr: string): string[] {
  const combined = `${stdout}\n${stderr}`;
  const out: string[] = [];
  const blockerPatterns = [
    /\buncaught\s+(syntaxerror|typeerror|referenceerror)\b/i,
    /\bdoes not provide an export named\b/i,
    /\berror\s+ts\d{4}\b/i,
    /\bmodule build failed\b/i,
    /\bfailed to compile\b/i,
    /\bcannot find module\b/i,
    /\bsyntaxerror\b/i,
  ];
  const ignorePatterns = [
    /^\s*warning[:\s]/i,
    /\b0\s+failing\b/i,
    /\b0\s+errors?\b/i,
    /\bno\s+errors?\b/i,
  ];

  for (const rawLine of combined.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line) continue;
    if (ignorePatterns.some((pattern) => pattern.test(line))) continue;
    if (!blockerPatterns.some((pattern) => pattern.test(line))) continue;
    out.push(line.length > 220 ? `${line.slice(0, 219)}…` : line);
    if (out.length >= 4) break;
  }

  return unique(out);
}

function normalizePathToken(value: string): string {
  return value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^[./]+/, "");
}

function extractPathTokens(text: string): string[] {
  const out: string[] = [];
  const pattern = /([A-Za-z0-9_./-]+\.[cm]?[jt]sx?|[A-Za-z0-9_./-]+\.(json|css|scss|md|yml|yaml))(?::\d+:\d+)?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const token = normalizePathToken(match[1]);
    if (token) out.push(token);
  }
  return unique(out);
}

function intersectsScope(paths: string[], scope: Set<string>): boolean {
  if (!scope.size) return true;
  if (!paths.length) return true;
  return paths.some((filePath) => {
    const normalized = normalizePathToken(filePath);
    if (scope.has(normalized)) return true;
    for (const scopePath of scope) {
      if (normalized.endsWith(scopePath) || scopePath.endsWith(normalized)) return true;
    }
    return false;
  });
}

function inferScriptCategory(script: string, scriptBody: string): "cheap" | "heavy" {
  if (script === "build") return "heavy";
  if (script === "check" && /\b(build|test|cypress|playwright|e2e|vitest|jest|mocha)\b/i.test(scriptBody)) {
    return "heavy";
  }
  return "cheap";
}

function chooseSanityScripts(args: {
  scripts: Record<string, string>;
  changedFiles: string[];
  requireLintScript?: boolean;
  requireBuildScript?: boolean;
}): Array<{ script: string; category: "cheap" | "heavy" }> {
  const out: Array<{ script: string; category: "cheap" | "heavy" }> = [];
  const changedCode = args.changedFiles.some(looksLikeCodeFile);
  const scripts = args.scripts;
  const requireBuildScript = Boolean(args.requireBuildScript);

  if (scripts.lint) out.push({ script: "lint", category: "cheap" });
  if (scripts.typecheck) out.push({ script: "typecheck", category: "cheap" });

  if (scripts.check && !out.some((item) => item.script === "check")) {
    const checkCategory = inferScriptCategory("check", scripts.check);
    if (!(checkCategory === "heavy" && scripts.build)) {
      out.push({ script: "check", category: checkCategory });
    }
  }
  if ((changedCode || requireBuildScript) && scripts.build && !out.some((item) => item.script === "build")) {
    out.push({ script: "build", category: "heavy" });
  }

  const dedup = new Map<string, { script: string; category: "cheap" | "heavy" }>();
  for (const item of out) {
    if (!dedup.has(item.script)) dedup.set(item.script, item);
  }
  return Array.from(dedup.values());
}

function hasChangedFile(changedFiles: string[], pattern: RegExp): boolean {
  return changedFiles.some((file) => pattern.test(file.toLowerCase()));
}

function buildTypeScriptNoEmitCommand(manager: PackageManager): SanityCommand {
  switch (manager) {
    case "pnpm":
      return {
        label: "pnpm exec tsc --noEmit",
        command: "pnpm",
        args: ["exec", "tsc", "--noEmit"],
        note: "Language-aware sanity check for TypeScript (compile/type/syntax without emit).",
        category: "cheap",
      };
    case "yarn":
      return {
        label: "yarn tsc --noEmit",
        command: "yarn",
        args: ["tsc", "--noEmit"],
        note: "Language-aware sanity check for TypeScript (compile/type/syntax without emit).",
        category: "cheap",
      };
    case "bun":
      return {
        label: "bunx tsc --noEmit",
        command: "bunx",
        args: ["tsc", "--noEmit"],
        note: "Language-aware sanity check for TypeScript (compile/type/syntax without emit).",
        category: "cheap",
      };
    case "npm":
    default:
      return {
        label: "npx tsc --noEmit",
        command: "npx",
        args: ["tsc", "--noEmit"],
        note: "Language-aware sanity check for TypeScript (compile/type/syntax without emit).",
        category: "cheap",
      };
  }
}

function buildFallbackLanguageCommands(args: {
  workspaceRoot: string;
  changedFiles: string[];
  manager: PackageManager;
  scriptsChosen: string[];
}): SanityCommand[] {
  const out: SanityCommand[] = [];
  const { workspaceRoot, changedFiles, manager, scriptsChosen } = args;
  const hasTsConfig = existsSync(path.join(workspaceRoot, "tsconfig.json"));
  const hasTypeScriptChanges = hasChangedFile(changedFiles, /\.(ts|tsx)$/);
  const hasPythonChanges = hasChangedFile(changedFiles, /\.py$/);
  const hasGoChanges = hasChangedFile(changedFiles, /\.go$/);
  const hasRustChanges = hasChangedFile(changedFiles, /\.rs$/);
  const hasJavaChanges = hasChangedFile(changedFiles, /\.java$/);

  const scriptSet = new Set(scriptsChosen.map((x) => x.toLowerCase()));
  const alreadyHasTsScriptCoverage = scriptSet.has("typecheck") || scriptSet.has("check");
  if (hasTsConfig && (hasTypeScriptChanges || changedFiles.length === 0) && !alreadyHasTsScriptCoverage) {
    out.push(buildTypeScriptNoEmitCommand(manager));
  }

  if (
    hasPythonChanges &&
    (existsSync(path.join(workspaceRoot, "pyproject.toml"))
      || existsSync(path.join(workspaceRoot, "requirements.txt"))
      || existsSync(path.join(workspaceRoot, "setup.py")))
  ) {
    const pyFiles = changedFiles
      .filter((file) => /\.py$/i.test(file))
      .slice(0, 20);
    if (pyFiles.length) {
      out.push({
        label: `python3 -m py_compile ${pyFiles.join(" ")}`,
        command: "python3",
        args: ["-m", "py_compile", ...pyFiles],
        note: "Language-aware sanity check for Python syntax in changed files.",
        category: "cheap",
      });
    }
  }

  if (hasGoChanges && existsSync(path.join(workspaceRoot, "go.mod"))) {
    out.push({
      label: "go test ./... -run ^$",
      command: "go",
      args: ["test", "./...", "-run", "^$"],
      note: "Language-aware sanity check for Go compile/link without running test bodies.",
      category: "cheap",
    });
  }

  if (hasRustChanges && existsSync(path.join(workspaceRoot, "Cargo.toml"))) {
    out.push({
      label: "cargo check",
      command: "cargo",
      args: ["check"],
      note: "Language-aware sanity check for Rust compilation.",
      category: "cheap",
    });
  }

  if (hasJavaChanges && existsSync(path.join(workspaceRoot, "pom.xml"))) {
    out.push({
      label: "mvn -q -DskipTests compile",
      command: "mvn",
      args: ["-q", "-DskipTests", "compile"],
      note: "Language-aware sanity check for Java compilation (Maven).",
      category: "cheap",
    });
  } else if (hasJavaChanges && existsSync(path.join(workspaceRoot, "gradlew"))) {
    out.push({
      label: "./gradlew -q classes",
      command: "./gradlew",
      args: ["-q", "classes"],
      note: "Language-aware sanity check for Java/Kotlin compilation (Gradle wrapper).",
      category: "cheap",
    });
  }

  return out;
}

function resolveSanityCommands(args: {
  workspaceRoot: string;
  changedFiles: string[];
  scripts: Record<string, string>;
  manager: PackageManager;
  requireLintScript?: boolean;
  requireBuildScript?: boolean;
}): { cheap: SanityCommand[]; heavy: SanityCommand[] } {
  const scriptChoices = chooseSanityScripts({
    scripts: args.scripts,
    changedFiles: args.changedFiles,
    requireLintScript: args.requireLintScript,
    requireBuildScript: args.requireBuildScript,
  });
  const scriptCommands: SanityCommand[] = scriptChoices.map((item) => {
    const command = buildScriptCommand(args.manager, item.script);
    return {
      label: `${command.command} ${command.args.join(" ")}`,
      command: command.command,
      args: command.args,
      note: item.category === "heavy" ? "Heavy script-based sanity check." : "Cheap script-based sanity check.",
      category: item.category,
      isFullBuild: item.script === "build",
    };
  });

  const fallbackCommands = buildFallbackLanguageCommands({
    workspaceRoot: args.workspaceRoot,
    changedFiles: args.changedFiles,
    manager: args.manager,
    scriptsChosen: scriptChoices.map((item) => item.script),
  });

  const allCommands = [...scriptCommands, ...fallbackCommands];
  const seen = new Set<string>();
  const deduped = allCommands.filter((cmd) => {
    const key = `${cmd.command}::${cmd.args.join(" ")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const cheap = deduped.filter((cmd) => cmd.category === "cheap").slice(0, 3);
  const heavy = deduped.filter((cmd) => cmd.category === "heavy").slice(0, 1);
  return { cheap, heavy };
}

function isCodeSourceFile(filePath: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(filePath);
}

function parseRelativeImports(content: string): Array<{ localName: string; importKind: "named" | "default"; importedName: string; spec: string }> {
  const out: Array<{ localName: string; importKind: "named" | "default"; importedName: string; spec: string }> = [];
  const regex = /import\s+([^;]+?)\s+from\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content))) {
    const clause = match[1].trim();
    const spec = match[2].trim();
    if (!spec.startsWith(".")) continue;
    if (clause.includes("{")) {
      const [defaultPart] = clause.split("{");
      const defaultName = defaultPart.replace(/,/g, "").trim();
      if (defaultName && !defaultName.startsWith("*")) {
        out.push({
          localName: defaultName,
          importKind: "default",
          importedName: "default",
          spec,
        });
      }
      const namedPart = clause.slice(clause.indexOf("{") + 1, clause.lastIndexOf("}"));
      for (const row of namedPart.split(",")) {
        const token = row.trim();
        if (!token) continue;
        const [importedRaw, localRaw] = token.split(/\s+as\s+/i).map((x) => x.trim()).filter(Boolean);
        const importedName = importedRaw || "";
        const localName = localRaw || importedName;
        if (!importedName || !localName) continue;
        out.push({
          localName,
          importKind: "named",
          importedName,
          spec,
        });
      }
      continue;
    }
    const defaultName = clause.trim();
    if (!defaultName || defaultName.startsWith("*")) continue;
    out.push({
      localName: defaultName,
      importKind: "default",
      importedName: "default",
      spec,
    });
  }
  return out;
}

function resolveRelativeImportPath(args: {
  workspaceRoot: string;
  fromFile: string;
  spec: string;
}): string | null {
  const fromAbs = path.join(args.workspaceRoot, args.fromFile);
  const base = path.resolve(path.dirname(fromAbs), args.spec);
  const workspaceRoot = path.resolve(args.workspaceRoot);
  if (!(base === workspaceRoot || base.startsWith(`${workspaceRoot}${path.sep}`))) {
    return null;
  }

  const hasExtension = path.extname(base).length > 0;
  const candidates: string[] = [];
  if (hasExtension) {
    candidates.push(base);
  } else {
    const extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"];
    for (const ext of extensions) {
      candidates.push(`${base}${ext}`);
      candidates.push(path.join(base, `index${ext}`));
    }
  }
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return normalizePathToken(path.relative(args.workspaceRoot, candidate));
    }
  }
  return null;
}

function jsxTagHasProps(attributeChunk: string): boolean {
  return /\b[A-Za-z_][A-Za-z0-9_:-]*\s*=/.test(attributeChunk);
}

function componentAppearsNoProps(args: {
  source: string;
  componentLocalName: string;
  importKind: "named" | "default";
  importedName: string;
}): boolean {
  const escaped = args.importedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (args.importKind === "named") {
    const hasNamedProps = new RegExp(`export\\s+const\\s+${escaped}\\s*=\\s*\\((\\s*[^)\\s][^)]*)\\)\\s*=>`).test(args.source)
      || new RegExp(`export\\s+function\\s+${escaped}\\s*\\((\\s*[^)\\s][^)]*)\\)`).test(args.source);
    if (hasNamedProps) return false;
    const hasNamedNoProps = new RegExp(`export\\s+const\\s+${escaped}\\s*=\\s*\\(\\s*\\)\\s*=>`).test(args.source)
      || new RegExp(`export\\s+function\\s+${escaped}\\s*\\(\\s*\\)`).test(args.source)
      || new RegExp(`const\\s+${escaped}\\s*:\\s*React\\.FC\\s*=\\s*\\(\\s*\\)\\s*=>`).test(args.source);
    return hasNamedNoProps;
  }
  const hasDefaultProps = /export\s+default\s+function\s+\w*\s*\((\s*[^)\s][^)]*)\)/.test(args.source)
    || /const\s+\w+\s*:\s*React\.FC<[^>]+>\s*=\s*\((\s*[^)\s][^)]*)\)\s*=>[\s\S]*export\s+default\s+\w+/.test(args.source);
  if (hasDefaultProps) return false;
  const hasDefaultNoProps = /export\s+default\s+function\s+\w*\s*\(\s*\)/.test(args.source)
    || /export\s+default\s*\(\s*\)\s*=>/.test(args.source)
    || /const\s+\w+\s*:\s*React\.FC\s*=\s*\(\s*\)\s*=>[\s\S]*export\s+default\s+\w+/.test(args.source);
  return hasDefaultNoProps;
}

async function runCheapStaticHeuristics(args: {
  workspaceRoot: string;
  changedFiles: string[];
}): Promise<ValidationCheckResult[]> {
  const workspaceRoot = path.resolve(args.workspaceRoot);
  const changedCodeFiles = unique(
    args.changedFiles
      .map((filePath) => normalizePathToken(filePath))
      .filter((filePath) => isCodeSourceFile(filePath) && existsSync(path.join(workspaceRoot, filePath))),
  );
  if (!changedCodeFiles.length) return [];

  const importFindings: string[] = [];
  const propFindings: string[] = [];
  const sourceCache = new Map<string, string>();

  for (const relativePath of changedCodeFiles) {
    const absPath = path.join(workspaceRoot, relativePath);
    const source = await fs.readFile(absPath, "utf8").catch(() => "");
    if (!source) continue;
    sourceCache.set(relativePath, source);

    const imports = parseRelativeImports(source);
    for (const row of imports) {
      const resolved = resolveRelativeImportPath({
        workspaceRoot,
        fromFile: relativePath,
        spec: row.spec,
      });
      if (!resolved) {
        importFindings.push(`${relativePath}: unresolved relative import '${row.spec}'.`);
      }
    }
  }

  for (const relativePath of changedCodeFiles.filter((filePath) => /\.(tsx|jsx)$/i.test(filePath))) {
    const source = sourceCache.get(relativePath) || await fs.readFile(path.join(workspaceRoot, relativePath), "utf8").catch(() => "");
    if (!source) continue;
    const imports = parseRelativeImports(source);
    const importByLocal = new Map(imports.map((row) => [row.localName, row]));
    const jsxRegex = /<([A-Z][A-Za-z0-9_]*)\b([^>]*)>/g;
    let match: RegExpExecArray | null;
    while ((match = jsxRegex.exec(source))) {
      const localName = match[1];
      const attrs = match[2] || "";
      if (!jsxTagHasProps(attrs)) continue;
      const importInfo = importByLocal.get(localName);
      if (!importInfo) continue;
      const resolvedComponentPath = resolveRelativeImportPath({
        workspaceRoot,
        fromFile: relativePath,
        spec: importInfo.spec,
      });
      if (!resolvedComponentPath || !/\.(tsx|jsx|ts|js)$/i.test(resolvedComponentPath)) continue;
      const componentSource = sourceCache.get(resolvedComponentPath)
        || await fs.readFile(path.join(workspaceRoot, resolvedComponentPath), "utf8").catch(() => "");
      if (!componentSource) continue;
      sourceCache.set(resolvedComponentPath, componentSource);
      if (!componentAppearsNoProps({
        source: componentSource,
        componentLocalName: localName,
        importKind: importInfo.importKind,
        importedName: importInfo.importedName,
      })) {
        continue;
      }
      propFindings.push(
        `${relativePath}: JSX <${localName} ...> passes props, but ${resolvedComponentPath} appears to define ${localName} without props.`,
      );
    }
  }

  const now = Date.now();
  const checks: ValidationCheckResult[] = [];
  checks.push({
    command: "heuristic: relative-import-resolution",
    status: importFindings.length ? "failed" : "passed",
    category: "cheap",
    exitCode: importFindings.length ? 1 : 0,
    timedOut: false,
    durationMs: Math.max(0, Date.now() - now),
    stdoutPreview: importFindings.slice(0, 3).join("\n"),
    stderrPreview: "",
    diagnostics: importFindings.slice(0, 6),
    qaConfigNotes: ["Cheap static heuristic: validate relative imports only in changed files."],
    artifacts: [],
  });
  checks.push({
    command: "heuristic: react-props-contract",
    status: propFindings.length ? "failed" : "passed",
    category: "cheap",
    exitCode: propFindings.length ? 1 : 0,
    timedOut: false,
    durationMs: Math.max(0, Date.now() - now),
    stdoutPreview: propFindings.slice(0, 3).join("\n"),
    stderrPreview: "",
    diagnostics: propFindings.slice(0, 6),
    qaConfigNotes: ["Cheap static heuristic: detect prop usage against components that appear to declare no props."],
    artifacts: [],
  });
  return checks;
}

function checkFailureIsInScope(check: ValidationCheckResult, scopeSet: Set<string>): boolean {
  const paths = extractPathTokens([
    ...(check.diagnostics || []),
    check.stderrPreview,
    check.stdoutPreview,
  ].join("\n"));
  return intersectsScope(paths, scopeSet);
}

function isProjectWideBlockingCheck(check: ValidationCheckResult): boolean {
  return !check.command.toLowerCase().startsWith("heuristic:");
}

export async function runPostEditSanityChecks(args: {
  workspaceRoot: string;
  changedFiles: string[];
  scopeFiles?: string[];
  timeoutMsPerCheck?: number;
  requireLintScript?: boolean;
  requireBuildScript?: boolean;
  enforceCleanProject?: boolean;
  detectHiddenLogBlockers?: boolean;
}): Promise<PostEditSanityResult> {
  const workspaceRoot = path.resolve(args.workspaceRoot);
  const scripts = await readPackageScripts(workspaceRoot);
  const manager = selectPackageManager(workspaceRoot);
  const detectHiddenLogBlockers = args.detectHiddenLogBlockers ?? true;
  const enforceCleanProject = Boolean(args.enforceCleanProject);
  const commandPlan = resolveSanityCommands({
    workspaceRoot,
    changedFiles: args.changedFiles,
    scripts,
    manager,
    requireLintScript: args.requireLintScript,
    requireBuildScript: args.requireBuildScript,
  });
  const heuristicChecks = await runCheapStaticHeuristics({
    workspaceRoot,
    changedFiles: args.changedFiles,
  });
  const metrics = {
    plannedChecks: heuristicChecks.length + commandPlan.cheap.length + commandPlan.heavy.length,
    executedChecks: 0,
    cheapChecksExecuted: 0,
    heavyChecksExecuted: 0,
    fullBuildChecksExecuted: 0,
    heavyChecksSkipped: 0,
    earlyInScopeFailures: 0,
  };

  if (!commandPlan.cheap.length && !commandPlan.heavy.length && !heuristicChecks.length) {
    return {
      checks: [],
      failureSummaries: [],
      blockingFailureSummaries: [],
      outOfScopeFailureSummaries: [],
      metrics,
    };
  }

  const timeoutMs = args.timeoutMsPerCheck ?? 90_000;
  const checks: ValidationCheckResult[] = [];
  const scopeSet = new Set((args.scopeFiles || []).map((x) => normalizePathToken(x)).filter(Boolean));

  for (const heuristicCheck of heuristicChecks) {
    checks.push(heuristicCheck);
    metrics.executedChecks += 1;
    metrics.cheapChecksExecuted += 1;
    if (heuristicCheck.status === "failed" && checkFailureIsInScope(heuristicCheck, scopeSet)) {
      metrics.earlyInScopeFailures += 1;
    }
  }

  for (const sanityCommand of commandPlan.cheap) {
    const result = await runCommand({
      command: sanityCommand.command,
      commandArgs: sanityCommand.args,
      cwd: workspaceRoot,
      timeoutMs,
      maxOutputChars: 8_000,
    });
    const hiddenBlockers = detectHiddenLogBlockers ? extractHiddenLogBlockers(result.stdout, result.stderr) : [];
    const diagnostics = unique([...extractDiagnostics(result.stdout, result.stderr), ...hiddenBlockers]).slice(0, 6);
    const failedByHiddenLogs = hiddenBlockers.length > 0;
    checks.push({
      command: sanityCommand.label,
      status: result.exitCode === 0 && !result.timedOut && !failedByHiddenLogs ? "passed" : "failed",
      category: "cheap",
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      durationMs: result.durationMs,
      stdoutPreview: result.stdout.slice(0, 1000),
      stderrPreview: result.stderr.slice(0, 1000),
      diagnostics,
      qaConfigNotes: [
        sanityCommand.note,
        ...(failedByHiddenLogs ? ["Hidden blocker signatures detected in command output; treated as a failing check."] : []),
      ],
      artifacts: [],
    });
    metrics.executedChecks += 1;
    metrics.cheapChecksExecuted += 1;
    const latest = checks[checks.length - 1];
    if (latest.status === "failed" && checkFailureIsInScope(latest, scopeSet)) {
      metrics.earlyInScopeFailures += 1;
    }
  }

  const skipHeavy = metrics.earlyInScopeFailures > 0;
  if (skipHeavy && commandPlan.heavy.length) {
    for (const skipped of commandPlan.heavy) {
      checks.push({
        command: skipped.label,
        status: "skipped",
        category: "heavy",
        exitCode: null,
        timedOut: false,
        durationMs: 0,
        stdoutPreview: "",
        stderrPreview: "",
        diagnostics: [],
        qaConfigNotes: [
          `${skipped.note} Skipped because cheap in-scope failures were already found.`,
        ],
        artifacts: [],
      });
      metrics.heavyChecksSkipped += 1;
    }
  } else {
    for (const sanityCommand of commandPlan.heavy) {
      const result = await runCommand({
        command: sanityCommand.command,
        commandArgs: sanityCommand.args,
        cwd: workspaceRoot,
        timeoutMs,
        maxOutputChars: 8_000,
      });
      const hiddenBlockers = detectHiddenLogBlockers ? extractHiddenLogBlockers(result.stdout, result.stderr) : [];
      const diagnostics = unique([...extractDiagnostics(result.stdout, result.stderr), ...hiddenBlockers]).slice(0, 6);
      const failedByHiddenLogs = hiddenBlockers.length > 0;
      checks.push({
        command: sanityCommand.label,
        status: result.exitCode === 0 && !result.timedOut && !failedByHiddenLogs ? "passed" : "failed",
        category: "heavy",
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        durationMs: result.durationMs,
        stdoutPreview: result.stdout.slice(0, 1000),
        stderrPreview: result.stderr.slice(0, 1000),
        diagnostics,
        qaConfigNotes: [
          sanityCommand.note,
          ...(failedByHiddenLogs ? ["Hidden blocker signatures detected in command output; treated as a failing check."] : []),
        ],
        artifacts: [],
      });
      metrics.executedChecks += 1;
      metrics.heavyChecksExecuted += 1;
      if (sanityCommand.isFullBuild) {
        metrics.fullBuildChecksExecuted += 1;
      }
    }
  }

  const failureSummaries: string[] = [];
  const blockingFailureSummaries: string[] = [];
  const outOfScopeFailureSummaries: string[] = [];

  for (const check of checks) {
    if (check.status !== "failed") continue;
    const detail = check.diagnostics?.[0] || check.stderrPreview || check.stdoutPreview || "No diagnostic captured.";
    const summary = `Post-edit sanity check failed: ${check.command} | ${detail.slice(0, 220)}`;
    const paths = extractPathTokens([
      ...(check.diagnostics || []),
      check.stderrPreview,
      check.stdoutPreview,
    ].join("\n"));
    const isInScope = intersectsScope(paths, scopeSet);
    const isProjectWide = enforceCleanProject && isProjectWideBlockingCheck(check);
    failureSummaries.push(summary);
    if (isInScope || isProjectWide) {
      blockingFailureSummaries.push(summary);
      continue;
    }
    outOfScopeFailureSummaries.push(summary);
  }

  return {
    checks,
    failureSummaries: unique(failureSummaries),
    blockingFailureSummaries: unique(blockingFailureSummaries),
    outOfScopeFailureSummaries: unique(outOfScopeFailureSummaries),
    metrics,
  };
}
