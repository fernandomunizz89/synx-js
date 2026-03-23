import { DONE_FILE_NAMES, STAGE_FILE_NAMES } from "../../lib/constants.js";
import { loadResolvedProjectConfig, loadPromptFile, resolveProviderConfigForAgent } from "../../lib/config.js";
import { buildAgentRoleContract } from "../../lib/agent-role-contract.js";
import { normalizeBuilderLikeModelOutput } from "../../lib/model-output-recovery.js";
import { ARTIFACT_FILES, loadTaskArtifact } from "../../lib/task-artifacts.js";
import { builderOutputSchema } from "../../lib/schema.js";
import type { StageEnvelope } from "../../lib/types.js";
import { createProvider } from "../../providers/factory.js";
import { nowIso } from "../../lib/utils.js";
import { unique, uniqueNormalized } from "../../lib/text-utils.js";
import { applyWorkspaceEdits, buildWorkspaceContextSnapshot, getGitChangedFiles } from "../../lib/workspace-tools.js";
import { WorkerBase } from "../base.js";

const DOCS_WRITER_DEFAULT_PROMPT = `You are the Synx Documentation Writer, a technical documentation specialist.

Your task input is provided as JSON. Analyse it carefully and produce complete, accurate documentation.

DOMAIN: README files, JSDoc/TSDoc inline comments, OpenAPI/Swagger specs, CHANGELOG entries,
Architecture Decision Records (ADRs), how-to guides, and API reference documentation.

STANDARDS:
- Follow the Diátaxis framework: tutorials (learning-oriented), how-to guides (task-oriented),
  reference (information-oriented), explanation (understanding-oriented).
- Write for the target audience: developers who will use or maintain the code.
- Keep documentation DRY: reference code instead of duplicating it.
- Use clear, concise language. Avoid jargon unless necessary and always define it.
- Include practical examples where relevant.

OUTPUT: Respond with a single JSON object matching the builder schema.
{{INPUT_JSON}}`;

/**
 * Synx Documentation Writer (Stage 04 – Docs Slot)
 *
 * Technical documentation specialist.
 * Handles README, JSDoc/TSDoc, OpenAPI specs, CHANGELOG, ADRs, and guides.
 * Output is routed directly to Human Review (no QA or Code Review for docs).
 *
 * Prompt file: .ai-agents/prompts/synx-docs-writer.md
 * (Create this file in your project's .ai-agents/prompts/ directory.)
 */
export class SynxDocsWriter extends WorkerBase {
  readonly agent = "Synx Documentation Writer" as const;
  readonly requestFileName = STAGE_FILE_NAMES.synxDocsWriter;
  readonly workingFileName = "04-synx-docs-writer.working.json";

  protected async processTask(taskId: string, request: StageEnvelope): Promise<void> {
    const startedAt = nowIso();
    const config = await loadResolvedProjectConfig();
    const prompt = await loadPromptFile("synx-docs-writer.md").catch(() => DOCS_WRITER_DEFAULT_PROMPT);
    const provider = createProvider(resolveProviderConfigForAgent(config, this.agent));
    const workspaceRoot = process.cwd();
    const baseInput = await this.buildAgentInput(taskId, request);
    const projectProfile = await loadTaskArtifact(taskId, ARTIFACT_FILES.projectProfile);
    const featureBrief = await loadTaskArtifact(taskId, ARTIFACT_FILES.featureBrief);
    const symbolContracts = await loadTaskArtifact(taskId, ARTIFACT_FILES.symbolContract);

    const workspaceContext = await buildWorkspaceContextSnapshot({
      workspaceRoot,
      query: baseInput.task.rawRequest,
      relatedFiles: baseInput.task.extraContext.relatedFiles || [],
      limits: { maxContextFiles: 10, maxTotalContextChars: 22_000, maxFileContextChars: 4_200, maxScanFiles: 1_100 },
    });

    const docsContract = `
SYNX DOCUMENTATION WRITER – EXECUTION CONTRACT:
- Scope: documentation files only (.md, .mdx, JSDoc/TSDoc comments, openapi.yaml/json, CHANGELOG.md, ADR files).
- Diátaxis: identify the documentation type and follow its conventions strictly.
- Developer-first: write for developers who are reading source code or onboarding.
- No duplication: reference existing code/docs instead of copying them.
- Output format: builder JSON shape. nextAgent must be "Human Review".
`;

    const roleContract = buildAgentRoleContract("Synx Documentation Writer", {
      stage: "synx-docs-writer",
      taskTypeHint: baseInput.task.typeHint,
    });

    const modelInput = {
      ...baseInput,
      workspaceContext,
      upstreamHandoff: { projectProfile, featureBrief, symbolContracts },
    };

    const systemPrompt = `${prompt.replace("{{INPUT_JSON}}", JSON.stringify(modelInput, null, 2))}\n\n${roleContract}\n\n${docsContract}`;

    const result = await provider.generateStructured({
      agent: "Synx Documentation Writer",
      taskId,
      stage: request.stage,
      taskType: baseInput.task.typeHint,
      systemPrompt,
      input: modelInput,
      expectedJsonSchemaDescription:
        '{ "implementationSummary": "string", "filesChanged": ["string"], "impactedFiles": ["string"], "changesMade": ["string"], "unitTestsAdded": ["string"], "testsToRun": ["string"], "technicalRisks": ["string"], "riskAssessment": { "buildRisk": "low | medium | high | unknown", "syntaxRisk": "low | medium | high | unknown", "importExportRisk": "low | medium | high | unknown", "typingRisk": "low | medium | high | unknown", "logicRisk": "low | medium | high | unknown", "integrationRisk": "low | medium | high | unknown", "regressionRisk": "low | medium | high | unknown" }, "reviewFocus": ["string"], "manualValidationNeeded": ["string"], "residualRisks": ["string"], "verificationMode": "static_review | executed_checks | mixed", "risks": ["string"], "edits": [{ "path": "string", "action": "create | replace | replace_snippet | delete", "content": "string", "find": "string", "replace": "string" }], "nextAgent": "Human Review" }',
    });

    const normalizedModelOutput = normalizeBuilderLikeModelOutput(result.parsed);
    const output = builderOutputSchema.parse(normalizedModelOutput.payload);

    if (normalizedModelOutput.notes.length) output.risks = unique([...output.risks, ...normalizedModelOutput.notes]);

    const gitChangedBefore = await getGitChangedFiles(workspaceRoot);
    const applied = await applyWorkspaceEdits({ workspaceRoot, edits: output.edits });
    const gitChangedFiles = await getGitChangedFiles(workspaceRoot);
    const effectiveChanged = unique([...applied.changedFiles, ...gitChangedFiles.filter((f) => !gitChangedBefore.includes(f))]);

    if (!effectiveChanged.length && !gitChangedFiles.length) {
      throw new Error("Synx Documentation Writer completed but no documentation changes were detected.");
    }

    output.filesChanged = effectiveChanged.length ? effectiveChanged : gitChangedFiles;
    output.impactedFiles = unique([...output.impactedFiles, ...output.filesChanged]);
    output.risks = uniqueNormalized([...output.risks, ...applied.warnings, ...applied.skippedEdits.map((x) => `Skipped edit: ${x}`)]);

    // Force nextAgent to "Human Review" – docs do not go through QA or Code Review
    output.nextAgent = "Human Review";

    const view = `# HANDOFF\n\n## Agent\nSynx Documentation Writer\n\n## Summary\n${output.implementationSummary}\n\n## Files Changed\n${output.filesChanged.map((f) => `- ${f}`).join("\n") || "- [none]"}\n\n## Changes Made\n${output.changesMade.map((c) => `- ${c}`).join("\n") || "- [none]"}\n\n## Next\nHuman Review\n`;

    await this.finishStage({
      taskId,
      stage: "synx-docs-writer",
      doneFileName: DONE_FILE_NAMES.synxDocsWriter,
      viewFileName: "04-synx-docs-writer.md",
      viewContent: view,
      output,
      nextAgent: "Human Review",
      humanApprovalRequired: true,
      nextInputRef: `done/${DONE_FILE_NAMES.synxDocsWriter}`,
      startedAt,
      provider: result.provider,
      model: result.model,
      parseRetries: result.parseRetries,
      validationPassed: result.validationPassed,
      providerAttempts: result.providerAttempts,
      providerBackoffRetries: result.providerBackoffRetries,
      providerBackoffWaitMs: result.providerBackoffWaitMs,
      providerRateLimitWaitMs: result.providerRateLimitWaitMs,
      estimatedInputTokens: result.estimatedInputTokens,
      estimatedOutputTokens: result.estimatedOutputTokens,
      estimatedTotalTokens: result.estimatedTotalTokens,
      estimatedCostUsd: result.estimatedCostUsd,
    });
  }
}
