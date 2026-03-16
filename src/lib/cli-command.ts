import path from "node:path";

function quoteIfNeeded(value: string): string {
  if (!value) return value;
  if (!/\s/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

function isSynxBinary(scriptPath: string): boolean {
  const base = path.basename(scriptPath).toLowerCase();
  return base === "synx" || base === "synx.cmd" || base === "synx.exe" || base === "ai-agents" || base === "ai-agents.cmd" || base === "ai-agents.exe";
}

export function commandBase(): string {
  const scriptPath = process.argv[1] || "";

  if (scriptPath && isSynxBinary(scriptPath)) return "synx";
  if (scriptPath) return `node ${quoteIfNeeded(scriptPath)}`;
  return "synx";
}

export function commandExample(args = ""): string {
  const base = commandBase();
  return args.trim() ? `${base} ${args.trim()}` : base;
}
