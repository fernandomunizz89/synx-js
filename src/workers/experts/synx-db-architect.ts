import { DONE_FILE_NAMES, STAGE_FILE_NAMES } from "../../lib/constants.js";
import { loadResolvedProjectConfig, loadPromptFile, resolveProviderConfigForAgent } from "../../lib/config.js";
import { buildAgentRoleContract } from "../../lib/agent-role-contract.js";
import { ensureCodeQualityBootstrap } from "../../lib/code-quality-bootstrap.js";
import { extractQaHandoffContext } from "../../lib/qa-context.js";
import { deriveQaFileHints } from "../../lib/qa-remediation.js";
import { normalizeBuilderLikeModelOutput } from "../../lib/model-output-recovery.js";
import { deriveQaRootCauseFocus } from "../../lib/root-cause-intelligence.js";
import { runPostEditSanityChecks } from "../../lib/post-edit-sanity.js";
import { formatResearchContextTag, requestResearchContext } from "../../lib/orchestrator.js";
import { ARTIFACT_FILES, loadTaskArtifact } from "../../lib/task-artifacts.js";
import { builderOutputSchema } from "../../lib/schema.js";
import type { StageEnvelope } from "../../lib/types.js";
import { createProvider } from "../../providers/factory.js";
import { nowIso } from "../../lib/utils.js";
import { trimText, unique, uniqueNormalized } from "../../lib/text-utils.js";
import { applyWorkspaceEdits, buildWorkspaceContextSnapshot, detectTestCapabilities, getGitChangedFiles } from "../../lib/workspace-tools.js";
import { WorkerBase } from "../base.js";

const DB_ARCHITECT_DEFAULT_PROMPT = `You are the Synx DB Architect, a database schema and migration specialist.

Your task input is provided as JSON. Analyse it carefully and produce a complete database implementation.

DOMAIN: PostgreSQL, MySQL, MongoDB, Prisma, Drizzle, TypeORM — schema design, migrations, indexes, and query optimization.

PRINCIPLES:
- Schema Design: normalise data to eliminate redundancy; use appropriate data types; enforce referential integrity with foreign keys.
- Migration Safety: always use additive migrations first (add column, add index, add table); never drop columns without a safe deprecation plan.
- Zero-Downtime: migrations must be deployable without locking tables; use concurrent index creation where supported.
- Rollback Strategy: every migration must have a corresponding down migration; document rollback steps explicitly.
- Index Optimization: create indexes aligned with query patterns; avoid over-indexing write-heavy tables; use composite indexes strategically.
- Query Performance: identify and eliminate N+1 patterns; use eager loading and pagination; add EXPLAIN ANALYZE evidence when relevant.
- Data Integrity: enforce NOT NULL, UNIQUE, CHECK, and FK constraints at the database level, not only in application code.
- Transactions: wrap multi-step mutations in database transactions to guarantee atomicity and consistency.

OUTPUT: Respond with a single JSON object matching the builder schema.
{{INPUT_JSON}}`;

/**
 * Synx DB Architect (Stage 04 – Expert Slot)
 *
 * Database schema architect and migration specialist.
 * Handles PostgreSQL, MySQL, MongoDB, Prisma, Drizzle, TypeORM schema design,
 * zero-downtime migrations, index optimization, and query performance.
 * Output is routed to Synx Code Reviewer for quality gate review.
 *
 * Prompt file: .ai-agents/prompts/synx-db-architect.md
 * (Create this file in your project's .ai-agents/prompts/ directory.)
 */
export class SynxDbArchitect extends WorkerBase {
  readonly agent = "Synx DB Architect" as const;
  readonly requestFileName = STAGE_FILE_NAMES.synxDbArchitect;
  readonly workingFileName = "04-synx-db-architect.working.json";

  protected async processTask(taskId: string, request: StageEnvelope): Promise<void> {
    const startedAt = nowIso();
    const config = await loadResolvedProjectConfig();
    const prompt = await loadPromptFile("synx-db-architect.md").catch(() => DB_ARCHITECT_DEFAULT_PROMPT);
    const provider = createProvider(resolveProviderConfigForAgent(config, this.agent));
    const workspaceRoot = process.cwd();
    const baseInput = await this.buildAgentInput(taskId, request);
    const qualityBootstrap = await ensureCodeQualityBootstrap({ workspaceRoot });
    await detectTestCapabilities(workspaceRoot);
    const qaHandoffContext = extractQaHandoffContext(baseInput.previousStage);
    const projectProfile = await loadTaskArtifact(taskId, ARTIFACT_FILES.projectProfile);
    const featureBrief = await loadTaskArtifact(taskId, ARTIFACT_FILES.featureBrief);
    const symbolContracts = await loadTaskArtifact(taskId, ARTIFACT_FILES.symbolContract);
    const latestQaFindings = (qaHandoffContext?.latestFindings ?? [])
      .slice(0, 5)
      .map((item) => ({
        issue: trimText(item.issue, 180),
        expectedResult: trimText(item.expectedResult, 180),
        receivedResult: trimText(item.receivedResult, 180),
        evidence: item.evidence.map((x) => trimText(x, 160)).slice(0, 3),
        recommendedAction: trimText(item.recommendedAction, 220),
      }));
    const qaFileHints = deriveQaFileHints([...latestQaFindings]);
    const rootCauseFocus = deriveQaRootCauseFocus({ qaFailures: [], findings: latestQaFindings });

    const researchDecision = await requestResearchContext({
      taskId,
      stage: "synx-db-architect",
      requesterAgent: this.agent,
      taskType: baseInput.task.typeHint,
      previousStage: baseInput.previousStage,
      errorContext: baseInput.task.rawRequest,
      targetTechnology: "PostgreSQL MySQL MongoDB Prisma Drizzle TypeORM schema migrations indexes query optimization",
      specificQuestion: `What is the safest database schema/migration approach for: ${baseInput.task.title}?`,
      repeatedIssues: [],
    });

    if (researchDecision.status === "abort_to_human") {
      const escalationOutput = {
        decision: "research_loop_detected",
        reason: researchDecision.abortReason || "Research anti-loop guard triggered.",
        triggerReasons: researchDecision.triggerReasons,
        researchContext: researchDecision.context,
      };
      const escalationView = `# HANDOFF\n\n## Agent\nSynx DB Architect\n\n## Decision\nEscalated to human review – Researcher loop guard triggered.\n\n## Reason\n${researchDecision.abortReason || "Research repeated while uncertainty persisted."}\n\n## Next\nHuman Review\n`;
      await this.finishStage({
        taskId,
        stage: "synx-db-architect",
        doneFileName: DONE_FILE_NAMES.synxDbArchitect,
        viewFileName: "04-synx-db-architect.md",
        viewContent: escalationView,
        output: escalationOutput,
        humanApprovalRequired: true,
        startedAt,
      });
      return;
    }

    const researchContextTag = researchDecision.context
      ? `[RESEARCH_CONTEXT]:\n${formatResearchContextTag(researchDecision.context)}`
      : "";

    const workspaceContext = await buildWorkspaceContextSnapshot({
      workspaceRoot,
      query: baseInput.task.rawRequest,
      relatedFiles: unique([
        ...(baseInput.task.extraContext.relatedFiles || []),
        ...qaFileHints,
        ...rootCauseFocus.sourceHints,
      ]),
      limits: { maxContextFiles: 10, maxTotalContextChars: 22_000, maxFileContextChars: 4_200, maxScanFiles: 1_100 },
    });

    const dbContract = `
SYNX DB ARCHITECT – EXECUTION CONTRACT:
- Stack: PostgreSQL, MySQL, or MongoDB. ORM: Prisma, Drizzle, or TypeORM. Strict TypeScript types for all schema definitions.
- Migration Safety: NEVER drop columns or tables without a documented deprecation plan. Always provide a rollback migration.
- Zero-Downtime: all migrations must be safe to run against a live database. Use concurrent index creation; avoid table locks.
- Index Design: indexes must reflect actual query patterns. Document each index with its target query. Avoid redundant indexes.
- N+1 Prevention: identify N+1 patterns in relation queries; recommend include/eager-loading strategies with ORM calls.
- Transactions: wrap multi-step mutations in explicit transactions. Document atomicity guarantees.
- Data Integrity: enforce constraints at the DB layer (NOT NULL, UNIQUE, CHECK, FK). Do not rely solely on application validation.
- Output format: same builder JSON shape with "nextAgent": "Synx Code Reviewer".
`;

    const roleContract = buildAgentRoleContract("Synx DB Architect", {
      stage: "synx-db-architect",
      taskTypeHint: baseInput.task.typeHint,
      qaAttempt: qaHandoffContext?.attempt ?? 0,
    });

    const modelInput = {
      ...baseInput,
      workspaceContext,
      upstreamHandoff: { projectProfile, featureBrief, symbolContracts },
      researchContext: researchDecision.context,
    };

    const systemPrompt = `${prompt.replace("{{INPUT_JSON}}", JSON.stringify(modelInput, null, 2))}\n\n${roleContract}\n\n${dbContract}${researchContextTag ? `\n\n${researchContextTag}` : ""}`;

    const result = await provider.generateStructured({
      agent: "Synx DB Architect",
      taskId,
      stage: request.stage,
      taskType: baseInput.task.typeHint,
      systemPrompt,
      input: modelInput,
      expectedJsonSchemaDescription:
        '{ "implementationSummary": "string", "filesChanged": ["string"], "impactedFiles": ["string"], "changesMade": ["string"], "unitTestsAdded": ["string"], "testsToRun": ["string"], "technicalRisks": ["string"], "riskAssessment": { "buildRisk": "low | medium | high | unknown", "syntaxRisk": "low | medium | high | unknown", "importExportRisk": "low | medium | high | unknown", "typingRisk": "low | medium | high | unknown", "logicRisk": "low | medium | high | unknown", "integrationRisk": "low | medium | high | unknown", "regressionRisk": "low | medium | high | unknown" }, "reviewFocus": ["string"], "manualValidationNeeded": ["string"], "residualRisks": ["string"], "verificationMode": "static_review | executed_checks | mixed", "risks": ["string"], "edits": [{ "path": "string", "action": "create | replace | replace_snippet | delete", "content": "string", "find": "string", "replace": "string" }], "nextAgent": "Synx Code Reviewer" }',
    });

    const normalizedModelOutput = normalizeBuilderLikeModelOutput(result.parsed);
    const output = builderOutputSchema.parse(normalizedModelOutput.payload);

    if (qualityBootstrap.notes.length) output.changesMade = unique([...qualityBootstrap.notes, ...output.changesMade]);
    if (qualityBootstrap.warnings.length) output.risks = unique([...output.risks, ...qualityBootstrap.warnings]);
    if (normalizedModelOutput.notes.length) output.risks = unique([...output.risks, ...normalizedModelOutput.notes]);

    const gitChangedBefore = await getGitChangedFiles(workspaceRoot);
    const applied = await applyWorkspaceEdits({ workspaceRoot, edits: output.edits });
    const gitChangedFiles = await getGitChangedFiles(workspaceRoot);
    const effectiveChanged = unique([...applied.changedFiles, ...gitChangedFiles.filter((f) => !gitChangedBefore.includes(f))]);

    if (!effectiveChanged.length && !gitChangedFiles.length) {
      throw new Error("Synx DB Architect completed but no code changes were detected.");
    }

    output.filesChanged = effectiveChanged.length ? effectiveChanged : gitChangedFiles;
    output.impactedFiles = unique([...output.impactedFiles, ...output.filesChanged, ...rootCauseFocus.sourceHints, ...qaFileHints]);
    output.risks = uniqueNormalized([...output.risks, ...applied.warnings, ...applied.skippedEdits.map((x) => `Skipped edit: ${x}`)]);

    const stageScopeFiles = unique([...applied.changedFiles, ...output.edits.map((e) => e.path), ...qualityBootstrap.changedFiles]);
    const postEditSanity = await runPostEditSanityChecks({
      workspaceRoot,
      changedFiles: stageScopeFiles.length ? stageScopeFiles : output.filesChanged,
      scopeFiles: stageScopeFiles.length ? stageScopeFiles : output.filesChanged,
      timeoutMsPerCheck: 120_000,
      requireLintScript: false,
      requireBuildScript: false,
      enforceCleanProject: false,
      detectHiddenLogBlockers: true,
    });

    if (postEditSanity.blockingFailureSummaries.length) {
      output.risks = uniqueNormalized([...output.risks, ...postEditSanity.blockingFailureSummaries.map((s) => `Quality gate: ${s}`)]);
    }

    output.technicalRisks = uniqueNormalized([...output.technicalRisks, ...output.risks]).slice(0, 16);

    const view = `# HANDOFF\n\n## Agent\nSynx DB Architect\n\n## Summary\n${output.implementationSummary}\n\n## Files Changed\n${output.filesChanged.map((f) => `- ${f}`).join("\n") || "- [none]"}\n\n## Changes Made\n${output.changesMade.map((c) => `- ${c}`).join("\n") || "- [none]"}\n\n## Technical Risks\n${output.technicalRisks.map((r) => `- ${r}`).join("\n") || "- [none]"}\n\n## Next\nSynx Code Reviewer\n`;

    // Force nextAgent to "Synx Code Reviewer" regardless of model output
    output.nextAgent = "Synx Code Reviewer";

    await this.finishStage({
      taskId,
      stage: "synx-db-architect",
      doneFileName: DONE_FILE_NAMES.synxDbArchitect,
      viewFileName: "04-synx-db-architect.md",
      viewContent: view,
      output,
      nextAgent: "Synx Code Reviewer",
      nextStage: "synx-code-reviewer",
      nextRequestFileName: STAGE_FILE_NAMES.synxCodeReviewer,
      nextInputRef: `done/${DONE_FILE_NAMES.synxDbArchitect}`,
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
