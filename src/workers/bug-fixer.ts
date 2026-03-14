import { DONE_FILE_NAMES, STAGE_FILE_NAMES } from "../lib/constants.js";
import { loadPromptFile, loadResolvedProjectConfig } from "../lib/config.js";
import { bugFixerOutputSchema } from "../lib/schema.js";
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

export class BugFixerWorker extends WorkerBase {
  readonly agent = "Bug Fixer" as const;
  readonly requestFileName = STAGE_FILE_NAMES.bugFixer;
  readonly workingFileName = "04b-bug-fixer.working.json";

  protected async processTask(taskId: string, request: StageEnvelope): Promise<void> {
    const startedAt = nowIso();
    const config = await loadResolvedProjectConfig();
    const prompt = await loadPromptFile("bug-fixer.md");
    const provider = createProvider(config.providers.planner);
    const workspaceRoot = process.cwd();
    const baseInput = await this.buildAgentInput(taskId, request);
    const testCapabilities = await detectTestCapabilities(workspaceRoot);
    const qaFailures = extractQaFailures(baseInput.previousStage);
    const requiresE2eRepair = qaFailures.some((x) => /\be2e\b|playwright|cypress/i.test(x));
    const workspaceContext = await buildWorkspaceContextSnapshot({
      workspaceRoot,
      query: `${baseInput.task.title}\n${baseInput.task.rawRequest}\n${JSON.stringify(baseInput.previousStage || {}, null, 2)}`,
      relatedFiles: baseInput.task.extraContext.relatedFiles,
    });

    const modelInput = {
      ...baseInput,
      workspaceContext,
      executionContract: {
        mustProduceRealEdits: true,
        allowedActions: ["create", "replace", "replace_snippet", "delete"],
        protectedPaths: [".ai-agents/**", ".git/**"],
        testCapabilities,
        requiresE2eRepair,
      },
    };

    const strictContract = `
MANDATORY EXECUTION CONTRACT:
- You MUST implement the bug fix through concrete file edits in "edits".
- You MAY edit any files that are directly related to the bug (source, tests, config, and wiring).
- If executionContract.testCapabilities.hasUnitTestScript is true, include at least one updated unit test path in "unitTestsAdded".
- If executionContract.requiresE2eRepair is true, include e2e-related updates and runnable e2e command(s) in "testsToRun".
- Use repository paths that exist in workspaceContext.files when possible.
- Prefer action "replace_snippet" for small/localized edits.
- Use action "replace" for full-file rewrites, and "create" only for new files.
- "content" is required for create/replace.
- For "replace_snippet", provide "find" and "replace".
- Keep edits scoped to bug resolution and its required tests.

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
      agent: "Bug Fixer",
      systemPrompt,
      input: modelInput,
      expectedJsonSchemaDescription:
        '{ "implementationSummary": "string", "filesChanged": ["string"], "changesMade": ["string"], "unitTestsAdded": ["string"], "testsToRun": ["string"], "risks": ["string"], "edits": [{ "path": "string", "action": "create | replace | replace_snippet | delete", "content": "string (required for create/replace)", "find": "string (required for replace_snippet)", "replace": "string (required for replace_snippet)" }], "nextAgent": "Reviewer" }',
    });
    const output = bugFixerOutputSchema.parse(result.parsed);
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
      throw new Error("Bug Fixer completed but no code changes were detected. No usable patch was applied.");
    }

    output.filesChanged = effectiveChanged;
    output.risks = unique([
      ...output.risks,
      ...applied.warnings,
      ...applied.skippedEdits.map((x) => `Skipped edit: ${x}`),
    ]);

    const view = `# HANDOFF

## Agent
Bug Fixer

## Implementation Summary
${output.implementationSummary}

## Files Changed
${output.filesChanged.length ? output.filesChanged.map((x) => `- ${x}`).join("\n") : "- [none]"}

## Changes Made
${output.changesMade.length ? output.changesMade.map((x, index) => `${index + 1}. ${x}`).join("\n") : "- [none]"}

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
      stage: "bug-fixer",
      doneFileName: DONE_FILE_NAMES.bugFixer,
      viewFileName: "04b-bug-fixer.md",
      viewContent: view,
      output,
      nextAgent: "Reviewer",
      nextStage: "reviewer",
      nextRequestFileName: STAGE_FILE_NAMES.reviewer,
      nextInputRef: `done/${DONE_FILE_NAMES.bugFixer}`,
      startedAt,
      provider: result.provider,
      model: result.model,
      parseRetries: result.parseRetries,
      validationPassed: result.validationPassed,
    });
  }
}
