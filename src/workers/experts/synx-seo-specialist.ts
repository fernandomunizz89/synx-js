import { DONE_FILE_NAMES, STAGE_FILE_NAMES } from "../../lib/constants.js";
import { loadResolvedProjectConfig, loadPromptFile } from "../../lib/config.js";
import { buildAgentRoleContract } from "../../lib/agent-role-contract.js";
import { ensureCodeQualityBootstrap } from "../../lib/code-quality-bootstrap.js";
import { extractQaHandoffContext } from "../../lib/qa-context.js";
import { deriveQaFileHints, synthesizeQaSelectorHotfixEdits } from "../../lib/qa-remediation.js";
import { matchesE2EFrameworkCommand, preferredE2ECommand, resolveTaskQaPreferences } from "../../lib/qa-preferences.js";
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

/**
 * Synx SEO Specialist
 *
 * Search Engine Optimization Architect.
 * Owns structured data (JSON-LD), Core Web Vitals, Next.js metadata API,
 * crawl integrity (robots.txt / sitemap.xml), and Lighthouse parity.
 * Collaborates with Synx Front Expert on LCP / INP / CLS regressions.
 */
export class SynxSeoSpecialist extends WorkerBase {
  readonly agent = "Synx SEO Specialist" as const;
  readonly requestFileName = STAGE_FILE_NAMES.synxSeoSpecialist;
  readonly workingFileName = "04-synx-seo-specialist.working.json";

  protected async processTask(taskId: string, request: StageEnvelope): Promise<void> {
    const startedAt = nowIso();
    const config = await loadResolvedProjectConfig();
    const prompt = await loadPromptFile("synx-seo-specialist.md");
    const provider = createProvider(config.providers.planner);
    const workspaceRoot = process.cwd();
    const baseInput = await this.buildAgentInput(taskId, request);
    const qaPreferences = resolveTaskQaPreferences(baseInput.task);
    const qualityBootstrap = await ensureCodeQualityBootstrap({ workspaceRoot });
    const testCapabilities = await detectTestCapabilities(workspaceRoot);
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
      stage: "synx-seo-specialist",
      requesterAgent: this.agent,
      taskType: baseInput.task.typeHint,
      previousStage: baseInput.previousStage,
      errorContext: baseInput.task.rawRequest,
      targetTechnology: "Next.js App Router SEO Core Web Vitals JSON-LD Schema.org Lighthouse",
      specificQuestion: `What is the best SEO/CWV implementation approach for: ${baseInput.task.title}?`,
      repeatedIssues: [],
    });

    if (researchDecision.status === "abort_to_human") {
      const escalationView = `# HANDOFF\n\n## Agent\nSynx SEO Specialist\n\n## Decision\nEscalated to human review – Researcher loop guard triggered.\n\n## Reason\n${researchDecision.abortReason || "Research repeated while uncertainty persisted."}\n\n## Next\nHuman Review\n`;
      await this.finishStage({
        taskId,
        stage: "synx-seo-specialist",
        doneFileName: DONE_FILE_NAMES.synxSeoSpecialist,
        viewFileName: "04-synx-seo-specialist.md",
        viewContent: escalationView,
        output: {
          decision: "research_loop_detected",
          reason: researchDecision.abortReason || "Research anti-loop guard triggered.",
          triggerReasons: researchDecision.triggerReasons,
          researchContext: researchDecision.context,
        },
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

    const seoContract = `
SYNX SEO SPECIALIST – EXECUTION CONTRACT:
- Stack: Next.js App Router ONLY. Use the metadata API (generateMetadata / export const metadata) – never raw <head> tags.
- Structured Data: implement JSON-LD using Schema.org types. Validate with Google Rich Results Test output.
- Core Web Vitals gate: LCP < 2.5 s, INP < 200 ms, CLS < 0.1. Provide evidence or instrumentation for improvements.
- Crawl integrity: robots.txt must not block important paths; sitemap.xml must include all canonical URLs; hreflang must be correct for i18n.
- Lighthouse targets: Performance ≥ 90, Accessibility ≥ 90, Best Practices ≥ 90, SEO ≥ 95.
- OpenGraph + Twitter Card: every public page must have og:title, og:description, og:image, twitter:card.
- Canonical URLs: enforce <link rel="canonical"> or Next.js alternates.canonical for every content page.
- Output format: same builder JSON shape with "nextAgent": "Synx QA Engineer".
`;

    const roleContract = buildAgentRoleContract("Synx SEO Specialist", {
      stage: "synx-seo-specialist",
      taskTypeHint: baseInput.task.typeHint,
      qaAttempt: qaHandoffContext?.attempt ?? 0,
    });

    const modelInput = {
      ...baseInput,
      workspaceContext,
      upstreamHandoff: { projectProfile, featureBrief, symbolContracts },
      researchContext: researchDecision.context,
    };

    const systemPrompt = `${prompt.replace("{{INPUT_JSON}}", JSON.stringify(modelInput, null, 2))}\n\n${roleContract}\n\n${seoContract}${researchContextTag ? `\n\n${researchContextTag}` : ""}`;

    const result = await provider.generateStructured({
      agent: "Synx SEO Specialist",
      taskId,
      stage: request.stage,
      taskType: baseInput.task.typeHint,
      systemPrompt,
      input: modelInput,
      expectedJsonSchemaDescription:
        '{ "implementationSummary": "string", "filesChanged": ["string"], "impactedFiles": ["string"], "changesMade": ["string"], "unitTestsAdded": ["string"], "testsToRun": ["string"], "technicalRisks": ["string"], "riskAssessment": { "buildRisk": "low | medium | high | unknown", "syntaxRisk": "low | medium | high | unknown", "importExportRisk": "low | medium | high | unknown", "typingRisk": "low | medium | high | unknown", "logicRisk": "low | medium | high | unknown", "integrationRisk": "low | medium | high | unknown", "regressionRisk": "low | medium | high | unknown" }, "reviewFocus": ["string"], "manualValidationNeeded": ["string"], "residualRisks": ["string"], "verificationMode": "static_review | executed_checks | mixed", "risks": ["string"], "edits": [{ "path": "string", "action": "create | replace | replace_snippet | delete", "content": "string", "find": "string", "replace": "string" }], "nextAgent": "Synx QA Engineer" }',
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
      throw new Error("Synx SEO Specialist completed but no code changes were detected.");
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
      requireLintScript: true,
      requireBuildScript: true,
      enforceCleanProject: true,
      detectHiddenLogBlockers: true,
    });

    if (postEditSanity.blockingFailureSummaries.length) {
      output.risks = uniqueNormalized([...output.risks, ...postEditSanity.blockingFailureSummaries.map((s) => `Quality gate: ${s}`)]);
    }

    const selectorHotfix = await synthesizeQaSelectorHotfixEdits({ workspaceRoot, findings: latestQaFindings, existingEdits: output.edits });
    output.edits = selectorHotfix.edits;
    if (selectorHotfix.notes.length) output.changesMade = unique([...output.changesMade, ...selectorHotfix.notes]);
    if (selectorHotfix.warnings.length) output.risks = unique([...output.risks, ...selectorHotfix.warnings]);

    const hasRequiredE2eCommand = output.testsToRun.some((x) => matchesE2EFrameworkCommand(x, qaPreferences.e2eFramework));
    const preferredCommand = preferredE2ECommand(qaPreferences.e2eFramework, testCapabilities.e2eScripts);
    if (qaPreferences.e2eRequired && !hasRequiredE2eCommand) {
      output.testsToRun = unique([...output.testsToRun, preferredCommand]);
    }

    output.technicalRisks = uniqueNormalized([...output.technicalRisks, ...output.risks]).slice(0, 16);

    const view = `# HANDOFF\n\n## Agent\nSynx SEO Specialist\n\n## Summary\n${output.implementationSummary}\n\n## Files Changed\n${output.filesChanged.map((f) => `- ${f}`).join("\n") || "- [none]"}\n\n## Changes Made\n${output.changesMade.map((c) => `- ${c}`).join("\n") || "- [none]"}\n\n## Technical Risks\n${output.technicalRisks.map((r) => `- ${r}`).join("\n") || "- [none]"}\n\n## Next\nSynx QA Engineer\n`;

    await this.finishStage({
      taskId,
      stage: "synx-seo-specialist",
      doneFileName: DONE_FILE_NAMES.synxSeoSpecialist,
      viewFileName: "04-synx-seo-specialist.md",
      viewContent: view,
      output,
      nextAgent: "Synx QA Engineer",
      nextStage: "synx-qa-engineer",
      nextRequestFileName: STAGE_FILE_NAMES.synxQaEngineer,
      nextInputRef: `done/${DONE_FILE_NAMES.synxSeoSpecialist}`,
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
