import { DONE_FILE_NAMES, STAGE_FILE_NAMES } from "../lib/constants.js";
import { loadPromptFile, loadResolvedProjectConfig } from "../lib/config.js";
import { extractQaHandoffContext } from "../lib/qa-context.js";
import { builderOutputSchema } from "../lib/schema.js";
import type { StageEnvelope } from "../lib/types.js";
import { createProvider } from "../providers/factory.js";
import { nowIso } from "../lib/utils.js";
import { applyWorkspaceEdits, buildWorkspaceContextSnapshot, detectTestCapabilities, getGitChangedFiles } from "../lib/workspace-tools.js";
import { WorkerBase } from "./base.js";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((x) => x.trim()).filter(Boolean)));
}

function extractQaFailures(previousStage: unknown): string[] {
  if (!previousStage || typeof previousStage !== "object") return [];
  const output = (previousStage as { output?: unknown }).output;
  if (!output || typeof output !== "object") return [];
  const failures = (output as { failures?: unknown }).failures;
  if (!Array.isArray(failures)) return [];
  return failures.filter((x): x is string => typeof x === "string");
}

function contextMentionsE2e(text: string): boolean {
  return /\be2e\b|playwright|cypress/i.test(text);
}

function formatQaFindingsForView(
  findings: Array<{ issue: string; expectedResult: string; receivedResult: string; recommendedAction: string }>,
): string {
  if (!findings.length) return "- [none]";
  return findings
    .map((item, index) => `${index + 1}. ${item.issue}
   Expected: ${item.expectedResult}
   Received: ${item.receivedResult}
   Recommended action: ${item.recommendedAction || "[none]"}`)
    .join("\n");
}

function hasE2eInfraEdits(edits: Array<{ path: string }>): boolean {
  return edits.some((edit) => {
    const p = edit.path.replace(/\\/g, "/").toLowerCase();
    return (
      p === "package.json" ||
      p.includes("/e2e/") ||
      p.endsWith(".spec.ts") ||
      p.endsWith(".spec.tsx") ||
      p.includes("playwright") ||
      p.includes("cypress")
    );
  });
}

export class BuilderWorker extends WorkerBase {
  readonly agent = "Feature Builder" as const;
  readonly requestFileName = STAGE_FILE_NAMES.builder;
  readonly workingFileName = "04-builder.working.json";

  protected async processTask(taskId: string, request: StageEnvelope): Promise<void> {
    const startedAt = nowIso();
    const config = await loadResolvedProjectConfig();
    const prompt = await loadPromptFile("feature-builder.md");
    const provider = createProvider(config.providers.planner);
    const workspaceRoot = process.cwd();
    const baseInput = await this.buildAgentInput(taskId, request);
    const testCapabilities = await detectTestCapabilities(workspaceRoot);
    const qaFailures = extractQaFailures(baseInput.previousStage);
    const qaHandoffContext = extractQaHandoffContext(baseInput.previousStage);
    const latestQaFindings = qaHandoffContext?.latestFindings ?? [];
    const cumulativeQaFindings = qaHandoffContext?.cumulativeFindings ?? [];
    const requiresE2eMainFlow = ["Feature", "Bug", "Refactor", "Mixed"].includes(baseInput.task.typeHint);
    const mustCreateE2eInfra = requiresE2eMainFlow && !testCapabilities.hasE2EScript;
    const requiresE2eRepair = [
      ...qaFailures,
      ...latestQaFindings.map((x) => `${x.issue} ${x.expectedResult} ${x.receivedResult}`),
      ...cumulativeQaFindings.map((x) => `${x.issue} ${x.expectedResult} ${x.receivedResult}`),
    ].some((x) => contextMentionsE2e(x));
    const workspaceContext = await buildWorkspaceContextSnapshot({
      workspaceRoot,
      query: `${baseInput.task.title}\n${baseInput.task.rawRequest}\n${JSON.stringify(baseInput.previousStage || {}, null, 2)}`,
      relatedFiles: baseInput.task.extraContext.relatedFiles,
    });

    const modelInput = {
      ...baseInput,
      workspaceContext,
      qaFeedback: {
        failures: qaFailures,
        latestExpectedVsReceived: latestQaFindings,
        cumulativeExpectedVsReceived: cumulativeQaFindings,
        history: qaHandoffContext?.history ?? [],
      },
      executionContract: {
        mustProduceRealEdits: true,
        allowedActions: ["create", "replace", "replace_snippet", "delete"],
        protectedPaths: [".ai-agents/**", ".git/**"],
        testCapabilities,
        requiresE2eMainFlow,
        mustCreateE2eInfra,
        requiresE2eRepair,
        requiresQaFeedbackRemediation: latestQaFindings.length > 0,
      },
    };

    const strictContract = `
MANDATORY EXECUTION CONTRACT:
- You MUST propose concrete file edits in "edits".
- You MAY edit any files that are directly related to the request (source, tests, config, and wiring).
- If executionContract.testCapabilities.hasUnitTestScript is true, include at least one updated unit test path in "unitTestsAdded".
- If executionContract.requiresE2eMainFlow is true, include runnable e2e command(s) in "testsToRun".
- If executionContract.mustCreateE2eInfra is true, create missing e2e script/config and at least one e2e test for the main flow.
- If executionContract.requiresE2eRepair is true, fix existing e2e coverage gaps called out by QA.
- If executionContract.requiresQaFeedbackRemediation is true, address every item from qaFeedback.latestExpectedVsReceived.
- Use qaFeedback.latestExpectedVsReceived.expectedResult vs receivedResult as explicit fix targets.
- Preserve previous QA fixes described in qaFeedback.cumulativeExpectedVsReceived and avoid regressions.
- Use repository paths that exist in workspaceContext.files when possible.
- Prefer action "replace_snippet" for small/localized edits.
- Use action "replace" for full-file rewrites, and "create" only for new files.
- "content" is required for create/replace.
- For "replace_snippet", provide "find" and "replace".
- Do not output placeholder files unless explicitly required by context.
- Keep edits minimal and directly tied to the task request.

Return exactly this JSON shape:
{
  "implementationSummary": "string",
  "filesChanged": ["string"],
  "changesMade": ["string"],
  "unitTestsAdded": ["string"],
  "testsToRun": ["string"],
  "risks": ["string"],
  "edits": [
    {
      "path": "relative/path.ext",
      "action": "create | replace | replace_snippet | delete",
      "content": "required for create/replace",
      "find": "required for replace_snippet",
      "replace": "required for replace_snippet"
    }
  ],
  "nextAgent": "Reviewer"
}
`;

    const systemPrompt = `${prompt.replace("{{INPUT_JSON}}", JSON.stringify(modelInput, null, 2))}\n\n${strictContract}`;
    const result = await provider.generateStructured({
      agent: "Feature Builder",
      systemPrompt,
      input: modelInput,
      expectedJsonSchemaDescription:
        '{ "implementationSummary": "string", "filesChanged": ["string"], "changesMade": ["string"], "unitTestsAdded": ["string"], "testsToRun": ["string"], "risks": ["string"], "edits": [{ "path": "string", "action": "create | replace | replace_snippet | delete", "content": "string (required for create/replace)", "find": "string (required for replace_snippet)", "replace": "string (required for replace_snippet)" }], "nextAgent": "Reviewer" }',
    });
    const output = builderOutputSchema.parse(result.parsed);
    if (testCapabilities.hasUnitTestScript && !output.unitTestsAdded.length) {
      output.risks = unique([
        ...output.risks,
        "Unit test scripts exist but no unit test file was reported in unitTestsAdded.",
      ]);
    }
    if (requiresE2eRepair && !output.testsToRun.some((x) => /\be2e\b|playwright|cypress/i.test(x))) {
      output.testsToRun = unique([...output.testsToRun, "npm run --if-present e2e"]);
      output.risks = unique([
        ...output.risks,
        "QA requested E2E remediation but testsToRun did not explicitly include an E2E command.",
      ]);
    }
    if (requiresE2eMainFlow && !output.testsToRun.some((x) => /\be2e\b|playwright|cypress/i.test(x))) {
      output.testsToRun = unique([...output.testsToRun, "npm run --if-present e2e"]);
      output.risks = unique([
        ...output.risks,
        "Main-flow E2E is required but testsToRun did not include an E2E command.",
      ]);
    }
    if (mustCreateE2eInfra && !hasE2eInfraEdits(output.edits)) {
      output.risks = unique([
        ...output.risks,
        "No E2E infrastructure edits were proposed although the project has no E2E script.",
      ]);
    }
    if (latestQaFindings.length && !output.changesMade.length) {
      output.risks = unique([
        ...output.risks,
        "QA provided detailed expected-vs-received findings, but changesMade is empty.",
      ]);
    }

    const applied = await applyWorkspaceEdits({
      workspaceRoot,
      edits: output.edits,
    });

    const gitChangedFiles = await getGitChangedFiles(workspaceRoot);
    const effectiveChanged = unique([
      ...gitChangedFiles,
      ...output.filesChanged,
      ...applied.appliedFiles,
    ]);

    if (!effectiveChanged.length) {
      throw new Error("Builder completed but no code changes were detected. No usable patch was applied.");
    }

    output.filesChanged = effectiveChanged;
    output.risks = unique([
      ...output.risks,
      ...applied.warnings,
      ...applied.skippedEdits.map((x) => `Skipped edit: ${x}`),
    ]);

    const view = `# HANDOFF

## Agent
Feature Builder

## Implementation Summary
${output.implementationSummary}

## Files Changed
${output.filesChanged.length ? output.filesChanged.map((x) => `- ${x}`).join("\n") : "- [none]"}

## Changes Made
${output.changesMade.length ? output.changesMade.map((x, index) => `${index + 1}. ${x}`).join("\n") : "- [none]"}

## QA Context Received (Latest Return)
${formatQaFindingsForView(latestQaFindings)}

## Unit Tests Added/Updated
${output.unitTestsAdded.length ? output.unitTestsAdded.map((x) => `- ${x}`).join("\n") : "- [none reported]"}

## Tests To Run
${output.testsToRun.length ? output.testsToRun.map((x, index) => `${index + 1}. ${x}`).join("\n") : "- [none]"}

## Risks
${output.risks.length ? output.risks.map((x) => `- ${x}`).join("\n") : "- [none]"}

## Applied Edits
${output.edits.length ? output.edits.map((x) => `- ${x.action.toUpperCase()} ${x.path}`).join("\n") : "- [none]"}

## Next
Reviewer
`;

    await this.finishStage({
      taskId,
      stage: "builder",
      doneFileName: DONE_FILE_NAMES.builder,
      viewFileName: "04-implementation.md",
      viewContent: view,
      output,
      nextAgent: "Reviewer",
      nextStage: "reviewer",
      nextRequestFileName: STAGE_FILE_NAMES.reviewer,
      nextInputRef: `done/${DONE_FILE_NAMES.builder}`,
      startedAt,
      provider: result.provider,
      model: result.model,
      parseRetries: result.parseRetries,
      validationPassed: result.validationPassed,
    });
  }
}
