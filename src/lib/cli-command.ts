import path from "node:path";

function quoteIfNeeded(value: string): string {
  if (!value) return value;
  if (!/\s/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

function isAiAgentsBinary(scriptPath: string): boolean {
  const base = path.basename(scriptPath).toLowerCase();
  return base === "ai-agents" || base === "ai-agents.cmd" || base === "ai-agents.exe";
}

export function commandBase(): string {
  const scriptPath = process.argv[1] || "";

  if (scriptPath && isAiAgentsBinary(scriptPath)) return "ai-agents";
  if (scriptPath) return `node ${quoteIfNeeded(scriptPath)}`;
  return "ai-agents";
}

export function commandExample(args = ""): string {
  const base = commandBase();
  return args.trim() ? `${base} ${args.trim()}` : base;
}
