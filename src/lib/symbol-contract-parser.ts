import path from "node:path";
import { promises as fs } from "node:fs";
import { unique } from "./text-utils.js";
import { walkFiles } from "./project-detector.js";

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

export function parseExportInfo(source: string): { named: string[]; hasDefault: boolean } {
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

export async function findFileByBasename(workspaceRoot: string, baseName: string): Promise<string> {
  const files = await walkFiles(workspaceRoot, 1800);
  const match = files.find((file) => file.endsWith(`/${baseName}`) || file === baseName);
  return match || "";
}

export async function readFileIfExists(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

export function resolveImportSpecifierPath(importerPath: string, specifier: string): string[] {
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
