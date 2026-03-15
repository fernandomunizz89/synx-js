import path from "node:path";
import { promises as fs } from "node:fs";
import { exists } from "./fs.js";
import type { WorkspaceEdit } from "./workspace-tools.js";

const CYPRESS_CONFIG_SIGNAL = /(cypress\.config\.ts|configfile is invalid|invalid cypress config|cypress config mismatch|invalid cypress configuration|exports is not defined in es module scope|referenceerror:\s*exports is not defined|no-require-imports|require\(\) style import is forbidden)/i;
const CYPRESS_RUN_PATTERN = /\bcypress\s+run\b/i;
const CYPRESS_CONFIG_TS_ARG_PATTERN = /--config-file\s+(["']?)(?:\.\/)?cypress\.config\.ts\1/gi;
const CYPRESS_CONFIG_CJS_ARG_PATTERN = /--config-file\s+(["']?)(?:\.\/)?cypress\.config\.cjs\1/gi;
const CYPRESS_TS_CONFIG_PATH = "cypress.config.ts";
const CYPRESS_CJS_CONFIG_PATH = "cypress.config.cjs";
const FALLBACK_CYPRESS_CJS = `const { defineConfig } = require("cypress");

module.exports = defineConfig({
  e2e: {
    baseUrl: "http://localhost:5173",
    specPattern: "e2e/**/*.cy.{js,jsx,ts,tsx}",
    setupNodeEvents() {},
  },
});
`;

export interface CypressScriptRecoveryResult {
  edits: WorkspaceEdit[];
  changed: boolean;
  note?: string;
  warning?: string;
}

function normalizeInputPath(filePath: string): string {
  return filePath.trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

function signalsSuggestInvalidCypressConfig(signals: string[]): boolean {
  return signals.some((item) => CYPRESS_CONFIG_SIGNAL.test(item));
}

function collectEditContentForPath(edits: WorkspaceEdit[], targetPath: string): string | null {
  const normalizedTarget = normalizeInputPath(targetPath).toLowerCase();
  for (let i = edits.length - 1; i >= 0; i -= 1) {
    const edit = edits[i];
    if (normalizeInputPath(edit.path).toLowerCase() !== normalizedTarget) continue;
    if ((edit.action === "replace" || edit.action === "create") && typeof edit.content === "string") {
      return edit.content;
    }
  }
  return null;
}

async function loadFileText(workspaceRoot: string, edits: WorkspaceEdit[], filePath: string): Promise<{ text: string | null; source: "edit" | "workspace" | "missing" }> {
  const fromEdits = collectEditContentForPath(edits, filePath);
  if (typeof fromEdits === "string") return { text: fromEdits, source: "edit" };

  const absolutePath = path.join(workspaceRoot, filePath);
  if (!(await exists(absolutePath))) return { text: null, source: "missing" };
  const text = await fs.readFile(absolutePath, "utf8").catch(() => null);
  return { text, source: text ? "workspace" : "missing" };
}

function buildCjsConfigFromTs(tsConfig: string): string | null {
  const source = tsConfig.replace(/\r\n/g, "\n").trim();
  if (!source) return null;

  const withoutImports = source
    .replace(/^\s*import\s+type[^\n]*\n/gm, "")
    .replace(/^\s*import\s+\{[^}]*defineConfig[^}]*\}\s+from\s+["']cypress["'];?\s*\n?/m, "");
  const rewritten = withoutImports.replace(/^\s*export\s+default\s+defineConfig\s*\(/m, "module.exports = defineConfig(");
  if (!/module\.exports\s*=\s*defineConfig\s*\(/m.test(rewritten)) return null;

  const body = rewritten.trim();
  const hasRequire = /^\s*const\s+\{\s*defineConfig\s*\}\s*=\s*require\(["']cypress["']\);?/m.test(body);
  const header = hasRequire ? "" : "const { defineConfig } = require(\"cypress\");\n\n";
  return `${header}${body}\n`;
}

function normalizeTsConfigForLint(tsConfig: string): string | null {
  const source = tsConfig.replace(/\r\n/g, "\n").trim();
  if (!source) return null;

  let next = source;
  next = next.replace(
    /^\s*const\s+\{\s*defineConfig\s*\}\s*=\s*require\((["'])cypress\1\)\s*;?\s*$/m,
    "import { defineConfig } from \"cypress\"",
  );
  next = next.replace(/\bmodule\.exports\s*=\s*defineConfig\s*\(/m, "export default defineConfig(");
  next = next.replace(/\bexports\.default\s*=\s*defineConfig\s*\(/m, "export default defineConfig(");
  if (next === source) return null;
  return `${next.trim()}\n`;
}

function replaceTsConfigArgWithCjs(script: string): { next: string; changed: boolean } {
  CYPRESS_CONFIG_TS_ARG_PATTERN.lastIndex = 0;
  const hasTsArg = CYPRESS_CONFIG_TS_ARG_PATTERN.test(script);
  CYPRESS_CONFIG_TS_ARG_PATTERN.lastIndex = 0;
  if (!hasTsArg) return { next: script, changed: false };

  const next = script.replace(CYPRESS_CONFIG_TS_ARG_PATTERN, (_match, quote: string) => {
    if (quote === "'" || quote === "\"") return `--config-file ${quote}${CYPRESS_CJS_CONFIG_PATH}${quote}`;
    return `--config-file ${CYPRESS_CJS_CONFIG_PATH}`;
  });
  CYPRESS_CONFIG_TS_ARG_PATTERN.lastIndex = 0;
  return { next, changed: next !== script };
}

function ensureConfigArgOnCypressRun(script: string): { next: string; changed: boolean } {
  if (!CYPRESS_RUN_PATTERN.test(script)) return { next: script, changed: false };
  CYPRESS_CONFIG_CJS_ARG_PATTERN.lastIndex = 0;
  const alreadyCjs = CYPRESS_CONFIG_CJS_ARG_PATTERN.test(script);
  CYPRESS_CONFIG_CJS_ARG_PATTERN.lastIndex = 0;
  if (alreadyCjs) return { next: script, changed: false };

  if (/--config-file\b/i.test(script)) {
    return { next: script, changed: false };
  }

  return {
    next: `${script.trim()} --config-file ${CYPRESS_CJS_CONFIG_PATH}`,
    changed: true,
  };
}

export async function enforceCypressConfigScriptConsistency(args: {
  workspaceRoot: string;
  edits: WorkspaceEdit[];
  signals: string[];
}): Promise<CypressScriptRecoveryResult> {
  if (!signalsSuggestInvalidCypressConfig(args.signals)) {
    return { edits: args.edits, changed: false };
  }

  const packageJson = await loadFileText(args.workspaceRoot, args.edits, "package.json");
  if (!packageJson.text) {
    return {
      edits: args.edits,
      changed: false,
      warning: "QA reported Cypress config issues, but package.json was not available for script recovery.",
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(packageJson.text) as Record<string, unknown>;
  } catch {
    return {
      edits: args.edits,
      changed: false,
      warning: `QA reported Cypress config issues, but package.json from ${packageJson.source} could not be parsed for script recovery.`,
    };
  }

  const scriptsRaw = parsed.scripts;
  const scripts = (scriptsRaw && typeof scriptsRaw === "object" ? scriptsRaw : {}) as Record<string, unknown>;
  const tsConfig = await loadFileText(args.workspaceRoot, args.edits, CYPRESS_TS_CONFIG_PATH);
  const cjsConfig = await loadFileText(args.workspaceRoot, args.edits, CYPRESS_CJS_CONFIG_PATH);
  let shouldWriteCjsConfig = false;
  let generatedCjsContent = "";

  if (!cjsConfig.text) {
    generatedCjsContent = tsConfig.text ? (buildCjsConfigFromTs(tsConfig.text) || FALLBACK_CYPRESS_CJS) : FALLBACK_CYPRESS_CJS;
    shouldWriteCjsConfig = true;
  }
  let shouldNormalizeTsConfig = false;
  let lintSafeTsConfig = "";
  if (tsConfig.text) {
    const normalized = normalizeTsConfigForLint(tsConfig.text);
    if (normalized && normalized !== tsConfig.text) {
      shouldNormalizeTsConfig = true;
      lintSafeTsConfig = normalized;
    }
  }

  let rewiredAnyScript = false;

  for (const [scriptName, value] of Object.entries(scripts)) {
    if (typeof value !== "string") continue;
    if (!CYPRESS_RUN_PATTERN.test(value)) continue;

    const replaced = replaceTsConfigArgWithCjs(value);
    const withConfigArg = ensureConfigArgOnCypressRun(replaced.next);
    if (replaced.changed || withConfigArg.changed) {
      scripts[scriptName] = withConfigArg.next;
      rewiredAnyScript = true;
    }
  }

  if (!rewiredAnyScript && !shouldWriteCjsConfig && !shouldNormalizeTsConfig) {
    return { edits: args.edits, changed: false };
  }

  const filteredEdits = args.edits.filter((edit) => {
    const normalized = normalizeInputPath(edit.path).toLowerCase();
    return normalized !== "package.json" && normalized !== CYPRESS_CJS_CONFIG_PATH && normalized !== CYPRESS_TS_CONFIG_PATH;
  });
  const notes: string[] = [];

  if (shouldWriteCjsConfig) {
    filteredEdits.push({
      path: CYPRESS_CJS_CONFIG_PATH,
      action: "replace",
      content: generatedCjsContent,
    });
    notes.push("Generated cypress.config.cjs fallback to avoid invalid TypeScript Cypress config runtime.");
  }
  if (shouldNormalizeTsConfig) {
    filteredEdits.push({
      path: CYPRESS_TS_CONFIG_PATH,
      action: "replace",
      content: lintSafeTsConfig,
    });
    notes.push("Normalized cypress.config.ts to lint-safe ESM syntax while keeping runtime on cypress.config.cjs.");
  }

  if (rewiredAnyScript) {
    parsed.scripts = scripts;
    const nextPackageJson = `${JSON.stringify(parsed, null, 2)}\n`;
    filteredEdits.push({
      path: "package.json",
      action: "replace",
      content: nextPackageJson,
    });
    notes.push("Forced Cypress scripts to use cypress.config.cjs after QA reported invalid cypress.config.ts.");
  }

  return {
    edits: filteredEdits,
    changed: true,
    note: notes.join(" "),
  };
}
