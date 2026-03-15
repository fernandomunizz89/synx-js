import path from "node:path";
import { existsSync } from "node:fs";
import { DONE_FILE_NAMES, STAGE_FILE_NAMES } from "../lib/constants.js";
import { loadPromptFile, loadResolvedProjectConfig } from "../lib/config.js";
import { buildAgentRoleContract } from "../lib/agent-role-contract.js";
import {
  buildBugBrief,
  bugBriefFactLines,
  collectProjectProfile,
  deriveSymbolContracts,
  projectProfileFactLines,
  runBugTriageChecks,
  symbolContractFactLines,
  type ProjectProfile,
} from "../lib/project-handoff.js";
import { ARTIFACT_FILES, loadTaskArtifact, saveTaskArtifact } from "../lib/task-artifacts.js";
import { bugInvestigatorOutputSchema } from "../lib/schema.js";
import type { StageEnvelope } from "../lib/types.js";
import { createProvider } from "../providers/factory.js";
import { nowIso } from "../lib/utils.js";
import { WorkerBase } from "./base.js";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((x) => x.trim()).filter(Boolean)));
}

function trimText(value: string, maxChars = 220): string {
  const next = value.trim();
  if (next.length <= maxChars) return next;
  return `${next.slice(0, Math.max(0, maxChars - 1))}…`;
}

function extractFilePathHints(lines: string[]): string[] {
  const out: string[] = [];
  const pattern = /([A-Za-z0-9_./-]+\.[cm]?[jt]sx?|[A-Za-z0-9_./-]+\.(json|cjs|mjs|css|scss|md|yml|yaml))/g;
  for (const line of lines) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line))) {
      const normalized = match[1].replace(/^[./]+/, "").trim();
      if (normalized) out.push(normalized);
    }
  }
  return unique(out);
}

function extractSymbolContractFileHints(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const hints: string[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const modulePath = typeof row.modulePath === "string" ? row.modulePath.trim() : "";
    const importerPath = typeof row.importerPath === "string" ? row.importerPath.trim() : "";
    if (modulePath) hints.push(modulePath);
    if (importerPath) hints.push(importerPath);
  }
  return unique(hints);
}

function includesPattern(lines: string[], pattern: RegExp): boolean {
  return lines.some((line) => pattern.test(line));
}

function normalizeWorkspacePathLabel(workspaceRoot: string, filePath: string): string {
  const root = workspaceRoot.replace(/\\/g, "/").replace(/\/+$/, "");
  const rootNoLead = root.replace(/^\/+/, "");
  let next = filePath.replace(/\\/g, "/").trim();
  if (!next) return "";
  next = next.replace(/:\d+:\d+$/, "");
  if (next.startsWith(root)) {
    next = next.slice(root.length);
  } else if (next.startsWith(rootNoLead)) {
    next = next.slice(rootNoLead.length);
  }
  next = next.replace(/^\/+/, "");
  next = next.replace(/^\.\//, "");
  return next;
}

function isExistingWorkspaceFile(workspaceRoot: string, relativePath: string): boolean {
  if (!relativePath) return false;
  return existsSync(path.join(workspaceRoot, relativePath));
}

export class BugInvestigatorWorker extends WorkerBase {
  readonly agent = "Bug Investigator" as const;
  readonly requestFileName = STAGE_FILE_NAMES.bugInvestigator;
  readonly workingFileName = "02b-bug-investigator.working.json";

  protected async processTask(taskId: string, request: StageEnvelope): Promise<void> {
    const startedAt = nowIso();
    const config = await loadResolvedProjectConfig();
    const prompt = await loadPromptFile("bug-investigator.md");
    const provider = createProvider(config.providers.planner);
    const baseInput = await this.buildAgentInput(taskId, request);
    let projectProfile = await loadTaskArtifact<ProjectProfile>(taskId, ARTIFACT_FILES.projectProfile);
    if (!projectProfile) {
      projectProfile = await collectProjectProfile({
        workspaceRoot: process.cwd(),
        taskTitle: baseInput.task.title,
        taskType: baseInput.task.typeHint,
        config,
      });
    }
    await saveTaskArtifact(taskId, ARTIFACT_FILES.projectProfile, projectProfile);
    const triageChecks = await runBugTriageChecks({
      workspaceRoot: process.cwd(),
      profile: projectProfile,
      maxCommands: 3,
    });
    const modelInput = {
      ...baseInput,
      projectProfile,
      triageChecks,
    };
    const roleContract = buildAgentRoleContract("Bug Investigator", {
      stage: "bug-investigator",
      taskTypeHint: baseInput.task.typeHint,
    });
    const systemPrompt = `${prompt.replace("{{INPUT_JSON}}", JSON.stringify(modelInput, null, 2))}\n\n${roleContract}`;
    const result = await provider.generateStructured({
      agent: "Bug Investigator",
      taskType: baseInput.task.typeHint,
      systemPrompt,
      input: modelInput,
      expectedJsonSchemaDescription:
        '{ "symptomSummary": "string", "knownFacts": ["string"], "likelyCauses": ["string"], "investigationSteps": ["string"], "unknowns": ["string"], "suspectFiles": ["string"], "suspectAreas": ["string"], "primaryHypothesis": "string", "secondaryHypotheses": ["string"], "riskAssessment": { "buildRisk": "low | medium | high | unknown", "syntaxRisk": "low | medium | high | unknown", "logicRisk": "low | medium | high | unknown", "integrationRisk": "low | medium | high | unknown", "regressionRisk": "low | medium | high | unknown" }, "builderChecks": ["string"], "handoffNotes": ["string"], "nextAgent": "Bug Fixer" }',
    });
    const output = bugInvestigatorOutputSchema.parse(result.parsed);
    const triageDiagnostics = triageChecks.flatMap((check) => check.diagnostics);
    const triageFileHints = extractFilePathHints([
      ...triageDiagnostics,
      ...output.knownFacts,
      ...output.likelyCauses,
      ...output.investigationSteps,
      ...output.unknowns,
    ]);
    const symbolContracts = await deriveSymbolContracts({
      workspaceRoot: process.cwd(),
      sourceTexts: unique([
        baseInput.task.rawRequest,
        output.symptomSummary,
        ...output.knownFacts,
        ...output.likelyCauses,
        ...output.secondaryHypotheses,
        ...triageDiagnostics,
      ]),
    });
    await saveTaskArtifact(taskId, ARTIFACT_FILES.symbolContract, symbolContracts);
    const symbolContractFileHints = extractSymbolContractFileHints(symbolContracts);

    const profileHints = unique([
      ...projectProfile.sourceLayout.keyFiles,
      ...projectProfile.sourceLayout.sampleSourceFiles.slice(0, 8),
      ...projectProfile.sourceLayout.sampleTestFiles.slice(0, 4),
    ]);
    output.suspectFiles = unique(
      unique([
        ...output.suspectFiles,
        ...triageFileHints,
        ...symbolContractFileHints,
        ...profileHints.slice(0, 6),
      ])
        .map((filePath) => normalizeWorkspacePathLabel(process.cwd(), filePath))
        .filter(Boolean)
        .map((filePath) => filePath.replace(/\/+/g, "/"))
        .filter((filePath) => isExistingWorkspaceFile(process.cwd(), filePath)),
    ).slice(0, 16);
    output.suspectAreas = unique([
      ...output.suspectAreas,
      ...output.suspectFiles.map((file) => file.split("/").slice(0, -1).join("/")).filter(Boolean),
    ]);
    if (!output.primaryHypothesis) {
      output.primaryHypothesis = output.likelyCauses[0] || output.symptomSummary;
    }
    output.secondaryHypotheses = unique([
      ...output.secondaryHypotheses,
      ...output.likelyCauses.slice(1, 4),
    ]);
    output.builderChecks = unique([
      ...output.builderChecks,
      ...output.investigationSteps,
      ...symbolContracts.slice(0, 3).map(
        (contract) => `Validate import/export contract in ${contract.modulePath || "[unknown file]"} for symbol ${contract.symbol}.`,
      ),
    ]).slice(0, 12);
    output.handoffNotes = unique([
      ...output.handoffNotes,
      "Findings are analytical and based on static evidence + triage checks only.",
      "Runtime behavior and full build compatibility still require real execution after implementation.",
    ]);

    const hasFailedTriage = triageChecks.some((check) => check.status === "failed");
    const hasSyntaxSignal = includesPattern(triageDiagnostics, /\bsyntaxerror\b|ts\d{4}/i);
    const hasImportSignal = includesPattern(triageDiagnostics, /does not provide an export named|cannot find module|import\/export/i);
    const hasLogicSignal = includesPattern(
      [...triageDiagnostics, ...output.likelyCauses, ...output.knownFacts],
      /countdown|state|race|condition|logic|incorrect behavior|not equal/i,
    );

    if (output.riskAssessment.buildRisk === "unknown") {
      output.riskAssessment.buildRisk = hasFailedTriage ? "medium" : "low";
    }
    if (output.riskAssessment.syntaxRisk === "unknown") {
      output.riskAssessment.syntaxRisk = hasSyntaxSignal ? "high" : "low";
    }
    if (output.riskAssessment.integrationRisk === "unknown") {
      output.riskAssessment.integrationRisk = hasImportSignal ? "high" : "medium";
    }
    if (output.riskAssessment.logicRisk === "unknown") {
      output.riskAssessment.logicRisk = hasLogicSignal ? "medium" : "low";
    }
    if (output.riskAssessment.regressionRisk === "unknown") {
      output.riskAssessment.regressionRisk = hasFailedTriage ? "medium" : "low";
    }
    await this.note({
      taskId,
      stage: "bug-investigator",
      message: "investigation_summary",
      details: {
        suspectFiles: output.suspectFiles.slice(0, 8),
        suspectAreas: output.suspectAreas.slice(0, 6),
        primaryHypothesis: output.primaryHypothesis,
        secondaryHypotheses: output.secondaryHypotheses.length,
        builderChecks: output.builderChecks.length,
        riskAssessment: output.riskAssessment,
      },
    });

    const bugBrief = buildBugBrief({
      taskTitle: baseInput.task.title,
      rawRequest: baseInput.task.rawRequest,
      dispatcherOutput: baseInput.previousStage,
      investigatorOutput: output,
      triageChecks,
    });
    await saveTaskArtifact(taskId, ARTIFACT_FILES.bugBrief, bugBrief);
    output.knownFacts = unique([
      ...output.knownFacts,
      ...projectProfileFactLines(projectProfile),
      ...bugBriefFactLines(bugBrief),
      ...symbolContractFactLines(symbolContracts),
    ]);
    output.investigationSteps = unique([
      ...output.investigationSteps,
      ...symbolContracts.slice(0, 3).map((contract) => `Honor symbol contract: ${contract.expectedImportShape} (${contract.mismatchSummary})`),
    ]);

    const view = `# HANDOFF

## Agent
Bug Investigator

## Symptom Summary
${output.symptomSummary}

## Known Facts
${output.knownFacts.length ? output.knownFacts.map((x) => `- ${x}`).join("\n") : "- [none]"}

## Likely Causes
${output.likelyCauses.length ? output.likelyCauses.map((x, index) => `${index + 1}. ${x}`).join("\n") : "- [none]"}

## Suspect Files
${output.suspectFiles.length ? output.suspectFiles.map((x) => `- ${x}`).join("\n") : "- [none identified]"}

## Suspect Areas
${output.suspectAreas.length ? output.suspectAreas.map((x) => `- ${x}`).join("\n") : "- [none identified]"}

## Hypotheses
- Primary: ${output.primaryHypothesis || "[not provided]"}
${output.secondaryHypotheses.length ? output.secondaryHypotheses.map((x) => `- Secondary: ${x}`).join("\n") : "- Secondary: [none]"}

## Investigation Steps
${output.investigationSteps.length ? output.investigationSteps.map((x, index) => `${index + 1}. ${x}`).join("\n") : "- [none]"}

## Builder Checks
${output.builderChecks.length ? output.builderChecks.map((x, index) => `${index + 1}. ${x}`).join("\n") : "- [none]"}

## Risk Assessment
- Build risk: ${output.riskAssessment.buildRisk}
- Syntax risk: ${output.riskAssessment.syntaxRisk}
- Logic risk: ${output.riskAssessment.logicRisk}
- Integration risk: ${output.riskAssessment.integrationRisk}
- Regression risk: ${output.riskAssessment.regressionRisk}

## Handoff Notes
${output.handoffNotes.length ? output.handoffNotes.map((x) => `- ${trimText(x, 300)}`).join("\n") : "- [none]"}

## Unknowns
${output.unknowns.length ? output.unknowns.map((x) => `- ${x}`).join("\n") : "- [none]"}

## Triage Checks
${triageChecks.length ? triageChecks.map((check) => {
  const diag = check.diagnostics[0] ? ` | diag=${check.diagnostics[0]}` : "";
  return `- ${check.status.toUpperCase()} | ${check.command} | exit=${check.exitCode ?? "null"} | ${check.durationMs}ms${diag}`;
}).join("\n") : "- [none]"}

## Symbol Contracts
${symbolContracts.length ? symbolContracts.map((contract) => `- ${contract.expectedImportShape} | ${contract.mismatchSummary}`).join("\n") : "- [none]"}

## Next
Bug Fixer
`;

    await this.finishStage({
      taskId,
      stage: "bug-investigator",
      doneFileName: DONE_FILE_NAMES.bugInvestigator,
      viewFileName: "02b-bug-investigator.md",
      viewContent: view,
      output,
      nextAgent: "Bug Fixer",
      nextStage: "bug-fixer",
      nextRequestFileName: STAGE_FILE_NAMES.bugFixer,
      nextInputRef: `done/${DONE_FILE_NAMES.bugInvestigator}`,
      startedAt,
      provider: result.provider,
      model: result.model,
      parseRetries: result.parseRetries,
      validationPassed: result.validationPassed,
    });
  }
}
