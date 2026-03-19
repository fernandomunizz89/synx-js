import { unique } from "../text-utils.js";

export function extractDiagnostics(stdout: string, stderr: string): string[] {
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

export function extractHiddenLogBlockers(stdout: string, stderr: string): string[] {
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

export function normalizePathToken(value: string): string {
  return value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^[./]+/, "");
}

export function extractPathTokens(text: string): string[] {
  const out: string[] = [];
  const pattern = /([A-Za-z0-9_./-]+\.[cm]?[jt]sx?|[A-Za-z0-9_./-]+\.(json|css|scss|md|yml|yaml))(?::\d+:\d+)?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const token = normalizePathToken(match[1]);
    if (token) out.push(token);
  }
  return unique(out);
}

export function intersectsScope(paths: string[], scope: Set<string>): boolean {
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
