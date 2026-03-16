import path from "node:path";
import { promises as fs } from "node:fs";
import { ensureDir, exists } from "./fs.js";
import { unique } from "./text-utils.js";
import { normalizeInputPath, walkFiles, type WorkspaceContextLimits } from "./workspace-scanner.js";

export interface CypressSelectorUsage {
  selector: string;
  specPaths: string[];
}

export interface CypressSelectorPreflightResult {
  requiredSelectors: CypressSelectorUsage[];
  missingSelectors: CypressSelectorUsage[];
}

function normalizeSignalLine(value: string, maxChars = 220): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1))}…`;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function parseCypressJunitDiagnostics(xml: string, maxItems = 6): string[] {
  const out: string[] = [];
  const testcaseRegex = /<testcase\b([^>]*)>([\s\S]*?)<\/testcase>/gi;
  let match: RegExpExecArray | null;

  while ((match = testcaseRegex.exec(xml)) && out.length < maxItems) {
    const attrs = match[1] || "";
    const body = match[2] || "";
    if (!/<failure\b/i.test(body)) continue;

    const nameMatch = /name="([^"]*)"/i.exec(attrs);
    const testcaseName = decodeXmlEntities(nameMatch?.[1] || "unknown testcase");

    const failureTagMatch = /<failure\b([^>]*)>/i.exec(body);
    const failureAttrs = failureTagMatch?.[1] || "";
    const messageAttr = decodeXmlEntities((/message="([^"]*)"/i.exec(failureAttrs)?.[1] || "").trim());

    const failureBodyMatch = /<failure\b[^>]*>([\s\S]*?)<\/failure>/i.exec(body);
    const failureBody = decodeXmlEntities((failureBodyMatch?.[1] || "").replace(/<[^>]+>/g, " "));

    const headline = normalizeSignalLine(messageAttr || failureBody || `Failure in ${testcaseName}`);
    const locationMatch = /([A-Za-z0-9_./-]+\.(?:cy|spec)\.[cm]?[jt]sx?:\d+:\d+)/.exec(failureBody);

    if (headline) out.push(`Test "${testcaseName}": ${headline}`);
    if (locationMatch?.[1]) out.push(`Location: ${locationMatch[1]}`);
  }

  return unique(out).slice(0, maxItems);
}

function safeToken(value: string): string {
  const token = value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return token.slice(0, 48) || "check";
}

export async function buildCypressQaOverrides(workspaceRoot: string, script: string): Promise<{
  extraArgs: string[];
  reportPath: string;
  qaConfigNotes: string[];
}> {
  const outDir = path.join(workspaceRoot, ".ai-agents", "runtime", "qa-cypress");
  await ensureDir(outDir);
  const reportPath = path.join(outDir, `${safeToken(script)}-${Date.now()}.xml`);

  return {
    extraArgs: [
      "--reporter",
      "junit",
      "--reporter-options",
      `mochaFile=${reportPath},toConsole=true`,
      "--config",
      "video=false,screenshotOnRunFailure=false,trashAssetsBeforeRuns=false,defaultCommandTimeout=6000",
    ],
    reportPath,
    qaConfigNotes: [
      "QA Cypress override: reporter=junit (console + XML output).",
      "QA Cypress override: screenshotOnRunFailure=false, video=false, and defaultCommandTimeout=6000 for lower-noise diagnostics.",
    ],
  };
}

function normalizeSpecPath(workspaceRoot: string, absolutePath: string): string {
  return normalizeInputPath(path.relative(workspaceRoot, absolutePath));
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

export async function runCypressSelectorPreflight(workspaceRoot: string): Promise<CypressSelectorPreflightResult> {
  const root = path.resolve(workspaceRoot);
  const scanLimits: WorkspaceContextLimits = {
    maxScanFiles: 2_000,
    maxFileSizeBytes: 400_000,
  };
  const allFiles = await walkFiles(root, scanLimits);
  const specFiles = allFiles.filter((filePath) => /(^|\/)e2e\/.*\.cy\.[cm]?[jt]sx?$/.test(filePath));
  const scaffoldSpecPattern = /(^|\/)(example|sample)\.cy\.[cm]?[jt]sx?$/i;
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
      return { relativePath, raw };
    }),
  );

  const requiredSelectors: CypressSelectorUsage[] = [];
  const missingSelectors: CypressSelectorUsage[] = [];
  for (const [selector, specSet] of selectorToSpecs.entries()) {
    const usage: CypressSelectorUsage = {
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

export async function readCypressReportDiagnostics(args: {
  workspaceRoot: string;
  reportPath: string;
  maxItems?: number;
}): Promise<{ diagnostics: string[]; artifacts: string[] }> {
  const relativeArtifact = normalizeInputPath(path.relative(args.workspaceRoot, args.reportPath));
  if (!(await exists(args.reportPath))) {
    return {
      diagnostics: [],
      artifacts: [`${relativeArtifact} (not generated)`],
    };
  }

  const xml = await fs.readFile(args.reportPath, "utf8").catch(() => "");
  return {
    diagnostics: xml ? parseCypressJunitDiagnostics(xml, args.maxItems ?? 8) : [],
    artifacts: [relativeArtifact],
  };
}
