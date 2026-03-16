export function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function trimText(value: string, maxChars = 220): string {
  const next = value.trim();
  if (next.length <= maxChars) return next;
  return `${next.slice(0, Math.max(0, maxChars - 1))}…`;
}

export function normalizeIssueLine(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.replace(/[.]+$/, "").trim();
}

export function uniqueNormalized(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values.map((item) => normalizeIssueLine(item)).filter(Boolean)) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}
