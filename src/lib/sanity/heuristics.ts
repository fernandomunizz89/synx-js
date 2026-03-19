import path from "node:path";
import { existsSync, promises as fs } from "node:fs";
import { type ValidationCheckResult } from "../workspace-tools.js";
import { unique } from "../text-utils.js";
import { normalizePathToken } from "./diagnostics.js";

export function isCodeSourceFile(filePath: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(filePath);
}

export function parseRelativeImports(content: string): Array<{ localName: string; importKind: "named" | "default"; importedName: string; spec: string }> {
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

export function resolveRelativeImportPath(args: {
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

export function jsxTagHasProps(attributeChunk: string): boolean {
  return /\b[A-Za-z_][A-Za-z0-9_:-]*\s*=/.test(attributeChunk);
}

export function componentAppearsNoProps(args: {
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

export async function runCheapStaticHeuristics(args: {
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
