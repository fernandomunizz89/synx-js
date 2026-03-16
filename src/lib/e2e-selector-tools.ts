import path from "node:path";
import { promises as fs } from "node:fs";
import { unique } from "./text-utils.js";
import { walkFiles, type WorkspaceContextLimits } from "./workspace-scanner.js";

export interface E2ESelectorUsage {
  selector: string;
  specPaths: string[];
}

export interface E2ESelectorPreflightResult {
  requiredSelectors: E2ESelectorUsage[];
  missingSelectors: E2ESelectorUsage[];
}

function normalizeSpecPath(workspaceRoot: string, absolutePath: string): string {
  return path.relative(workspaceRoot, absolutePath).replace(/\\/g, "/");
}

export function collectSelectorsFromSpec(content: string): string[] {
  const selectors: string[] = [];
  const selectorPattern = /\[data-cy=["']([^"']+)["']\]/g;
  let match: RegExpExecArray | null;
  while ((match = selectorPattern.exec(content))) {
    const selector = (match[1] || "").trim();
    if (selector) selectors.push(selector);
  }
  return unique(selectors);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function hasNativeDataCySelector(content: string, selector: string): boolean {
  const escapedSelector = escapeRegExp(selector);
  const nativeTagPattern = new RegExp(
    `<\\s*[a-z][a-z0-9:-]*\\b[^>]*\\bdata-cy\\s*=\\s*["']${escapedSelector}["'][^>]*>`,
    "i",
  );
  return nativeTagPattern.test(content);
}

export async function runE2ESelectorPreflight(workspaceRoot: string): Promise<E2ESelectorPreflightResult> {
  const root = path.resolve(workspaceRoot);
  const scanLimits: WorkspaceContextLimits = {
    maxScanFiles: 2_000,
    maxFileSizeBytes: 400_000,
  };
  const allFiles = await walkFiles(root, scanLimits);
  const specFiles = allFiles.filter((filePath) => /(^|\/)e2e\/.*\.(?:cy|spec)\.[cm]?[jt]sx?$/.test(filePath));
  const scaffoldSpecPattern = /(^|\/)(example|sample)\.(?:cy|spec)\.[cm]?[jt]sx?$/i;
  const nonScaffoldSpecFiles = specFiles.filter((filePath) => !scaffoldSpecPattern.test(filePath));
  const effectiveSpecFiles = nonScaffoldSpecFiles.length ? nonScaffoldSpecFiles : specFiles;
  const sourceFiles = allFiles.filter((filePath) => /^src\/.*\.[cm]?[jt]sx?$/.test(filePath));

  const selectorToSpecs = new Map<string, Set<string>>();
  for (const relativePath of effectiveSpecFiles) {
    const absolutePath = path.join(root, relativePath);
    const raw = await fs.readFile(absolutePath, "utf8").catch(() => "");
    if (!raw) continue;
    const selectors = collectSelectorsFromSpec(raw);
    for (const selector of selectors) {
      if (!selectorToSpecs.has(selector)) selectorToSpecs.set(selector, new Set<string>());
      selectorToSpecs.get(selector)?.add(normalizeSpecPath(root, absolutePath));
    }
  }

  const sourceContent = await Promise.all(
    sourceFiles.map(async (relativePath) => {
      const absolutePath = path.join(root, relativePath);
      const raw = await fs.readFile(absolutePath, "utf8").catch(() => "");
      return { raw };
    }),
  );

  const requiredSelectors: E2ESelectorUsage[] = [];
  const missingSelectors: E2ESelectorUsage[] = [];
  for (const [selector, specSet] of selectorToSpecs.entries()) {
    const usage: E2ESelectorUsage = {
      selector,
      specPaths: Array.from(specSet).sort(),
    };
    requiredSelectors.push(usage);

    const existsInSource = sourceContent.some((entry) => hasNativeDataCySelector(entry.raw, selector));
    if (!existsInSource) {
      missingSelectors.push(usage);
    }
  }

  requiredSelectors.sort((a, b) => a.selector.localeCompare(b.selector));
  missingSelectors.sort((a, b) => a.selector.localeCompare(b.selector));
  return {
    requiredSelectors,
    missingSelectors,
  };
}
