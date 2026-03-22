import { runCommand } from "./workspace-tools.js";
import { unique } from "./text-utils.js";
import { type PackageManager, type ProjectProfile } from "./project-detector.js";

export interface InvestigationCheck {
  command: string;
  status: "passed" | "failed";
  exitCode: number | null;
  durationMs: number;
  diagnostics: string[];
}

export interface BugBrief {
  generatedAt: string;
  symptomSummary: string;
  likelyRootCauses: string[];
  reproductionEvidence: string[];
  triageChecks: InvestigationCheck[];
  quickWins: string[];
  blockerPatterns: string[];
  suspectFiles: string[];
  suspectAreas: string[];
  primaryHypothesis: string;
  secondaryHypotheses: string[];
  builderChecks: string[];
  riskAssessment: {
    buildRisk: "low" | "medium" | "high" | "unknown";
    syntaxRisk: "low" | "medium" | "high" | "unknown";
    logicRisk: "low" | "medium" | "high" | "unknown";
    integrationRisk: "low" | "medium" | "high" | "unknown";
    regressionRisk: "low" | "medium" | "high" | "unknown";
  };
  handoffNotes: string[];
}

export function buildManagerScriptCommand(manager: PackageManager, script: string): { command: string; args: string[] } {
  switch (manager) {
    case "pnpm":
      return { command: "pnpm", args: ["run", "--if-present", script] };
    case "yarn":
      return { command: "yarn", args: ["run", script] };
    case "bun":
      return { command: "bun", args: ["run", script] };
    case "npm":
    default:
      return { command: "npm", args: ["run", "--if-present", script] };
  }
}

export function extractDiagnostics(stdout: string, stderr: string): string[] {
  const combined = `${stdout}\n${stderr}`;
  const out: string[] = [];
  for (const rawLine of combined.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line) continue;
    if (!/\b(error|failed|cannot|syntax|typeerror|referenceerror|ts\d{4}|exception|fatal)\b/i.test(line)) continue;
    out.push(line.length > 220 ? `${line.slice(0, 219)}…` : line);
    if (out.length >= 8) break;
  }
  return unique(out);
}

export function typeScriptNoEmitCommand(manager: PackageManager): { command: string; args: string[]; label: string } {
  switch (manager) {
    case "pnpm":
      return { command: "pnpm", args: ["exec", "tsc", "--noEmit"], label: "pnpm exec tsc --noEmit" };
    case "yarn":
      return { command: "yarn", args: ["tsc", "--noEmit"], label: "yarn tsc --noEmit" };
    case "bun":
      return { command: "bunx", args: ["tsc", "--noEmit"], label: "bunx tsc --noEmit" };
    case "npm":
    default:
      return { command: "npx", args: ["tsc", "--noEmit"], label: "npx tsc --noEmit" };
  }
}

export async function runBugTriageChecks(args: {
  workspaceRoot: string;
  profile: ProjectProfile;
  maxCommands?: number;
}): Promise<InvestigationCheck[]> {
  const commands: Array<{ command: string; args: string[]; label: string }> = [];
  const maxCommands = args.maxCommands ?? 3;
  const manager = args.profile.packageManager;

  if (args.profile.scriptSummary.typecheck.length) {
    commands.push({
      ...buildManagerScriptCommand(manager, args.profile.scriptSummary.typecheck[0]),
      label: `${buildManagerScriptCommand(manager, args.profile.scriptSummary.typecheck[0]).command} ${buildManagerScriptCommand(manager, args.profile.scriptSummary.typecheck[0]).args.join(" ")}`,
    });
  } else if (args.profile.tooling.hasTsConfig) {
    commands.push(typeScriptNoEmitCommand(manager));
  }

  if (args.profile.scriptSummary.lint.length) {
    const lint = args.profile.scriptSummary.lint[0];
    const cmd = buildManagerScriptCommand(manager, lint);
    commands.push({ ...cmd, label: `${cmd.command} ${cmd.args.join(" ")}` });
  } else if (args.profile.scriptSummary.check.length) {
    const check = args.profile.scriptSummary.check[0];
    const cmd = buildManagerScriptCommand(manager, check);
    commands.push({ ...cmd, label: `${cmd.command} ${cmd.args.join(" ")}` });
  }

  const results: InvestigationCheck[] = [];
  for (const command of commands.slice(0, maxCommands)) {
    const result = await runCommand({
      command: command.command,
      commandArgs: command.args,
      cwd: args.workspaceRoot,
      timeoutMs: 150_000,
      maxOutputChars: 8_000,
    });
    results.push({
      command: command.label,
      status: result.exitCode === 0 && !result.timedOut ? "passed" : "failed",
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      diagnostics: extractDiagnostics(result.stdout, result.stderr),
    });
  }

  return results;
}

function textFromUnknown(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function arrayFromUnknown(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean);
}

function riskFromUnknown(value: unknown): "low" | "medium" | "high" | "unknown" {
  const normalized = textFromUnknown(value).toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high" || normalized === "unknown") {
    return normalized;
  }
  return "unknown";
}

export function buildBugBrief(args: {
  taskTitle: string;
  rawRequest: string;
  dispatcherOutput: unknown;
  investigatorOutput: unknown;
  triageChecks: InvestigationCheck[];
}): BugBrief {
  const dispatcher = (args.dispatcherOutput && typeof args.dispatcherOutput === "object")
    ? args.dispatcherOutput as Record<string, unknown>
    : {};
  const investigator = (args.investigatorOutput && typeof args.investigatorOutput === "object")
    ? args.investigatorOutput as Record<string, unknown>
    : {};

  const likelyRootCauses = unique([
    ...arrayFromUnknown(investigator.likelyCauses),
    ...arrayFromUnknown(dispatcher.assumptions),
  ]).slice(0, 10);

  const reproductionEvidence = unique([
    args.rawRequest,
    ...arrayFromUnknown(investigator.knownFacts),
    ...args.triageChecks.map((check) => {
      const diag = check.diagnostics[0] || "no diagnostics";
      return `${check.command} => ${check.status} (exit=${check.exitCode ?? "null"}) | ${diag}`;
    }),
  ]).slice(0, 14);

  const quickWins = unique([
    ...arrayFromUnknown(investigator.investigationSteps),
    ...arrayFromUnknown(dispatcher.constraints),
  ]).slice(0, 10);

  const blockerPatterns = unique(
    reproductionEvidence
      .filter((item) => /(does not provide an export named|ts\d{4}|syntaxerror|typeerror|e2e|selector|baseurl|specpattern)/i.test(item))
      .slice(0, 10),
  );
  const suspectFiles = arrayFromUnknown(investigator.suspectFiles).slice(0, 16);
  const suspectAreas = arrayFromUnknown(investigator.suspectAreas).slice(0, 12);
  const primaryHypothesis = textFromUnknown(investigator.primaryHypothesis) || likelyRootCauses[0] || args.taskTitle;
  const secondaryHypotheses = arrayFromUnknown(investigator.secondaryHypotheses).slice(0, 8);
  const builderChecks = arrayFromUnknown(investigator.builderChecks).slice(0, 10);
  const handoffNotes = arrayFromUnknown(investigator.handoffNotes).slice(0, 8);
  const riskAssessmentRaw = (investigator.riskAssessment && typeof investigator.riskAssessment === "object")
    ? investigator.riskAssessment as Record<string, unknown>
    : {};
  const riskAssessment = {
    buildRisk: riskFromUnknown(riskAssessmentRaw.buildRisk),
    syntaxRisk: riskFromUnknown(riskAssessmentRaw.syntaxRisk),
    logicRisk: riskFromUnknown(riskAssessmentRaw.logicRisk),
    integrationRisk: riskFromUnknown(riskAssessmentRaw.integrationRisk),
    regressionRisk: riskFromUnknown(riskAssessmentRaw.regressionRisk),
  };

  return {
    generatedAt: new Date().toISOString(),
    symptomSummary: textFromUnknown(investigator.symptomSummary) || args.taskTitle,
    likelyRootCauses,
    reproductionEvidence,
    triageChecks: args.triageChecks,
    quickWins,
    blockerPatterns,
    suspectFiles,
    suspectAreas,
    primaryHypothesis,
    secondaryHypotheses,
    builderChecks,
    riskAssessment,
    handoffNotes,
  };
}
