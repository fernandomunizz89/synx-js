import path from "node:path";
import { promises as fs } from "node:fs";
import { exists } from "./fs.js";
import type { WorkspaceEdit } from "./workspace-tools.js";

export interface QaFindingLike {
  issue: string;
  expectedResult: string;
  receivedResult: string;
  evidence: string[];
  recommendedAction: string;
}

const REL_PATH_HINT_PATTERN = /((?:src|app|apps|packages|services|libs|server|client|web|frontend|backend|e2e|cypress|tests?|specs?)\/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+)/g;
const ABS_PATH_HINT_PATTERN = /\/((?:src|app|apps|packages|services|libs|server|client|web|frontend|backend|e2e|cypress|tests?|specs?)\/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+)/g;
const DATA_CY_SELECTOR_PATTERN = /(?:\[data-cy\s*=\s*["']([^"']+)["']\]|data-cy\s*=\s*["']([^"']+)["'])/g;
const MISSING_E2E_SPEC_PATTERN = /no spec files were found|can'?t run because no spec files were found|did not find e2e spec files/i;
const CYPRESS_CONFIG_SIGNAL_PATTERN = /cypress\.config|configfile is invalid|invalid cypress config|specpattern|baseurl/i;

const GENERIC_MAIN_FLOW_CYPRESS_SPEC = `/// <reference types="cypress" />

describe("Main flow smoke test", () => {
  it("loads the application shell", () => {
    cy.visit("/");
    cy.get("body").should("exist");
  });
});
`;

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizePath(filePath: string): string {
  return filePath.trim().replace(/\\/g, "/").replace(/^\/+/, "").replace(/^\.\//, "");
}

function isJsxLikeFile(filePath: string): boolean {
  return /\.(?:[cm]?[jt]sx|vue|svelte|html)$/i.test(filePath);
}

function isE2eSpecPath(filePath: string): boolean {
  const normalized = normalizePath(filePath).toLowerCase();
  return (
    /^(?:cypress\/e2e|e2e|tests?\/e2e|specs?\/e2e)\//.test(normalized)
    && /\.(?:cy|spec)\.[cm]?[jt]sx?$/.test(normalized)
  );
}

function findingBlob(finding: QaFindingLike): string {
  return [
    finding.issue,
    finding.expectedResult,
    finding.receivedResult,
    finding.recommendedAction,
    ...finding.evidence,
  ].join("\n");
}

function extractPathHints(text: string): string[] {
  const out: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = REL_PATH_HINT_PATTERN.exec(text))) {
    out.push(normalizePath(match[1]));
  }
  while ((match = ABS_PATH_HINT_PATTERN.exec(text))) {
    out.push(normalizePath(match[1]));
  }

  for (const configFile of ["cypress.config.ts", "cypress.config.cjs", "cypress.config.js", "cypress.config.mjs"]) {
    if (new RegExp(`\\b${configFile.replace(".", "\\.")}\\b`, "i").test(text)) {
      out.push(configFile);
    }
  }

  return unique(out);
}

function detectMentionedSelectors(findings: QaFindingLike[]): string[] {
  const out: string[] = [];
  for (const finding of findings) {
    const text = findingBlob(finding);
    let match: RegExpExecArray | null;
    while ((match = DATA_CY_SELECTOR_PATTERN.exec(text))) {
      const selector = (match[1] || match[2] || "").trim();
      if (selector) out.push(selector);
    }
  }
  return unique(out);
}

function shouldCreateMainFlowSpec(findings: QaFindingLike[]): boolean {
  const combined = findings.map((finding) => findingBlob(finding)).join("\n").toLowerCase();
  return MISSING_E2E_SPEC_PATTERN.test(combined);
}

function hasE2eSpecEdit(edits: WorkspaceEdit[]): boolean {
  return edits.some((edit) => isE2eSpecPath(edit.path));
}

export function deriveQaFileHints(findings: QaFindingLike[]): string[] {
  const hints: string[] = [];
  const combined = findings.map((finding) => findingBlob(finding)).join("\n");

  for (const finding of findings) {
    hints.push(...extractPathHints(findingBlob(finding)));
  }

  if (CYPRESS_CONFIG_SIGNAL_PATTERN.test(combined.toLowerCase())) {
    hints.push("cypress.config.ts");
    hints.push("cypress.config.cjs");
  }

  if (shouldCreateMainFlowSpec(findings)) {
    hints.push("e2e/main-flow.cy.ts");
  }

  return unique(hints);
}

function removeEditsForPath(edits: WorkspaceEdit[], relativePath: string): WorkspaceEdit[] {
  const normalized = normalizePath(relativePath).toLowerCase();
  return edits.filter((edit) => normalizePath(edit.path).toLowerCase() !== normalized);
}

async function readBaseContent(
  workspaceRoot: string,
  existingEdits: WorkspaceEdit[],
  relativePath: string,
): Promise<string | null> {
  const normalized = normalizePath(relativePath).toLowerCase();
  for (let i = existingEdits.length - 1; i >= 0; i -= 1) {
    const edit = existingEdits[i];
    if (normalizePath(edit.path).toLowerCase() !== normalized) continue;
    if ((edit.action === "replace" || edit.action === "create") && typeof edit.content === "string") {
      return edit.content;
    }
  }

  const absolutePath = path.join(workspaceRoot, relativePath);
  if (!(await exists(absolutePath))) return null;
  return fs.readFile(absolutePath, "utf8").catch(() => null);
}

function ensureCypressTypesReference(content: string): string {
  if (/^\s*\/\/\/\s*<reference\s+types=["']cypress["']\s*\/>/m.test(content)) return content;
  return `/// <reference types="cypress" />\n\n${content}`;
}

function hasNativeDataCyAttribute(content: string, selector: string): boolean {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<\\s*[a-z][a-z0-9:-]*\\b[^>]*\\bdata-cy\\s*=\\s*["']${escaped}["'][^>]*>`, "i");
  return pattern.test(content);
}

function injectDataCyByPattern(content: string, selector: string, pattern: RegExp): { changed: boolean; next: string } {
  const next = content.replace(pattern, `<$1 data-cy="${selector}"$2>`);
  return { changed: next !== content, next };
}

function applySelectorHotfix(content: string, selector: string): { changed: boolean; next: string } {
  if (hasNativeDataCyAttribute(content, selector)) {
    return { changed: false, next: content };
  }

  const lowerSelector = selector.toLowerCase();
  const headingPattern = /<([hH][1-6])(?![^>]*\bdata-cy=)([^>]*)>/m;
  const buttonPattern = /<(button|a)(?![^>]*\bdata-cy=)([^>]*)>/m;
  const inputPattern = /<(input|textarea|select)(?![^>]*\bdata-cy=)([^>]*)>/m;
  const clickablePattern = /<([a-z][a-z0-9:-]*)(?![^>]*\bdata-cy=)([^>]*\bonClick\s*=\s*\{[^}]+\}[^>]*)>/m;
  const textPattern = /<(span|p|div|text)(?![^>]*\bdata-cy=)([^>]*)>/m;
  const rootPattern = /<(main|section|article|div)(?![^>]*\bdata-cy=)([^>]*)>/m;

  if (/(title|heading|header|headline)/.test(lowerSelector)) {
    const patched = injectDataCyByPattern(content, selector, headingPattern);
    if (patched.changed) return patched;
  }
  if (/(button|btn|control|submit|reset|start|pause|play|stop)/.test(lowerSelector)) {
    const patchedButton = injectDataCyByPattern(content, selector, buttonPattern);
    if (patchedButton.changed) return patchedButton;
    const patchedClickable = injectDataCyByPattern(content, selector, clickablePattern);
    if (patchedClickable.changed) return patchedClickable;
  }
  if (/(input|field|search|email|password|textarea|select|form)/.test(lowerSelector)) {
    const patched = injectDataCyByPattern(content, selector, inputPattern);
    if (patched.changed) return patched;
  }
  if (/(display|value|label|status|text|counter|timer)/.test(lowerSelector)) {
    const patched = injectDataCyByPattern(content, selector, textPattern);
    if (patched.changed) return patched;
  }

  const patchedClickable = injectDataCyByPattern(content, selector, clickablePattern);
  if (patchedClickable.changed) return patchedClickable;
  const patchedRoot = injectDataCyByPattern(content, selector, rootPattern);
  if (patchedRoot.changed) return patchedRoot;
  const patchedText = injectDataCyByPattern(content, selector, textPattern);
  if (patchedText.changed) return patchedText;

  return { changed: false, next: content };
}

function stripDataCyFromCustomComponentProps(content: string): {
  changed: boolean;
  next: string;
  removedSelectors: string[];
} {
  const removedSelectors: string[] = [];
  const next = content.replace(/<([A-Z][A-Za-z0-9_]*)\b([^>]*)>/g, (_full, tagName, attrs: string) => {
    if (!/\bdata-cy\s*=/.test(attrs)) return `<${tagName}${attrs}>`;
    const selectorMatches = Array.from(attrs.matchAll(/\bdata-cy\s*=\s*["']([^"']+)["']/g));
    for (const match of selectorMatches) {
      if (match[1]) removedSelectors.push(match[1].trim());
    }
    const cleanedAttrs = attrs
      .replace(/\s*\bdata-cy\s*=\s*["'][^"']*["']/g, "")
      .replace(/\s{2,}/g, " ");
    return `<${tagName}${cleanedAttrs}>`;
  });
  return {
    changed: next !== content,
    next,
    removedSelectors: unique(removedSelectors),
  };
}

function sanitizeDataCyPropsInExistingEdits(existingEdits: WorkspaceEdit[]): {
  edits: WorkspaceEdit[];
  notes: string[];
  removedSelectors: string[];
} {
  const notes: string[] = [];
  const removedSelectors: string[] = [];
  const edits = existingEdits.map((edit) => {
    if ((edit.action !== "replace" && edit.action !== "create") || typeof edit.content !== "string") {
      return edit;
    }
    if (!isJsxLikeFile(edit.path) || !/\bdata-cy\s*=/.test(edit.content)) {
      return edit;
    }
    const sanitized = stripDataCyFromCustomComponentProps(edit.content);
    if (!sanitized.changed) return edit;

    removedSelectors.push(...sanitized.removedSelectors);
    notes.push(
      `Auto-sanity applied in ${edit.path}: removed data-cy props from framework component nodes; selectors must be attached to rendered DOM/SVG elements.`,
    );
    return {
      ...edit,
      content: sanitized.next,
    };
  });
  return {
    edits,
    notes: unique(notes),
    removedSelectors: unique(removedSelectors),
  };
}

function collectCandidateSelectorFiles(findings: QaFindingLike[], edits: WorkspaceEdit[]): string[] {
  const hinted = deriveQaFileHints(findings)
    .filter((filePath) => isJsxLikeFile(filePath))
    .filter((filePath) => !isE2eSpecPath(filePath));
  const editedFiles = edits
    .map((edit) => normalizePath(edit.path))
    .filter((filePath) => isJsxLikeFile(filePath))
    .filter((filePath) => !isE2eSpecPath(filePath));
  return unique([...hinted, ...editedFiles]);
}

export async function synthesizeQaSelectorHotfixEdits(args: {
  workspaceRoot: string;
  findings: QaFindingLike[];
  existingEdits: WorkspaceEdit[];
}): Promise<{ edits: WorkspaceEdit[]; notes: string[]; warnings: string[] }> {
  const sanitized = sanitizeDataCyPropsInExistingEdits(args.existingEdits);
  const selectors = unique([
    ...detectMentionedSelectors(args.findings),
    ...sanitized.removedSelectors,
  ]);
  let nextEdits = [...sanitized.edits];
  const notes: string[] = [...sanitized.notes];
  const warnings: string[] = [];
  const candidateFiles = collectCandidateSelectorFiles(args.findings, nextEdits);

  for (const selector of selectors) {
    let patchedPath = "";
    for (const candidatePath of candidateFiles) {
      const baseContent = await readBaseContent(args.workspaceRoot, nextEdits, candidatePath);
      if (typeof baseContent !== "string") continue;
      const patched = applySelectorHotfix(baseContent, selector);
      if (!patched.changed) continue;

      nextEdits = removeEditsForPath(nextEdits, candidatePath);
      nextEdits.push({
        path: candidatePath,
        action: "replace",
        content: patched.next,
      });
      patchedPath = candidatePath;
      break;
    }

    if (patchedPath) {
      notes.push(`Auto-remediation applied: ensured data-cy="${selector}" in ${patchedPath}.`);
      continue;
    }
    warnings.push(`QA selector hotfix could not place data-cy="${selector}" automatically; inspect likely UI component files and apply manually.`);
  }

  if (shouldCreateMainFlowSpec(args.findings) && !hasE2eSpecEdit(nextEdits)) {
    nextEdits.push({
      path: "e2e/main-flow.cy.ts",
      action: "create",
      content: GENERIC_MAIN_FLOW_CYPRESS_SPEC,
    });
    notes.push("Auto-remediation applied: created a minimal runnable Cypress E2E spec at e2e/main-flow.cy.ts.");
  }

  nextEdits = nextEdits.map((edit) => {
    if ((edit.action !== "replace" && edit.action !== "create") || typeof edit.content !== "string") {
      return edit;
    }
    if (!isE2eSpecPath(edit.path) || !/\.tsx?$|\.ts$/i.test(edit.path)) {
      return edit;
    }
    const withRef = ensureCypressTypesReference(edit.content);
    if (withRef === edit.content) return edit;
    notes.push(`Auto-remediation applied: ensured Cypress type reference header in ${edit.path}.`);
    return {
      ...edit,
      content: withRef,
    };
  });

  return {
    edits: nextEdits,
    notes: unique(notes),
    warnings: unique(warnings),
  };
}
