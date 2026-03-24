import { DONE_FILE_NAMES, STAGE_FILE_NAMES } from "../../lib/constants.js";
import { loadResolvedProjectConfig, loadPromptFile, resolveProviderConfigForAgent } from "../../lib/config.js";
import { buildAgentRoleContract } from "../../lib/agent-role-contract.js";
import { formatProjectMemoryForContext } from "../../lib/project-memory.js";
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

const DEVOPS_EXPERT_DEFAULT_PROMPT = `You are the Synx DevOps Expert, an infrastructure and CI/CD specialist.

Your task input is provided as JSON. Analyse it carefully and produce a complete implementation.

DOMAIN: Docker, GitHub Actions, CI/CD pipelines, Kubernetes manifests, Terraform, Nginx, environment configuration.

RULES:
- Dockerfiles must use multi-stage builds; never copy secrets or .env files into layers.
- GitHub Actions workflows must pin action versions and use caching where appropriate.
- All infrastructure code must be idempotent and version-pinned.
- Follow least-privilege for all IAM / service-account configurations.
- Never hard-code secrets; use secret references (GitHub Secrets, env vars, Vault paths).

OUTPUT: Respond with a single JSON object matching the builder schema.
{{INPUT_JSON}}`;

/**
 * Synx DevOps Expert (Stage 04 – Expert Slot)
 *
 * Infrastructure and CI/CD specialist.
 * Handles Docker, GitHub Actions, Terraform, Kubernetes, Nginx, and cloud infra tasks.
 * Output is routed to Synx Code Reviewer for quality gate review.
 *
 * Prompt file: .ai-agents/prompts/synx-devops-expert.md
 * (Create this file in your project's .ai-agents/prompts/ directory.)
 */
export class SynxDevopsExpert extends WorkerBase {
  readonly agent = "Synx DevOps Expert" as const;
  readonly requestFileName = STAGE_FILE_NAMES.synxDevopsExpert;
  readonly workingFileName = "04-synx-devops-expert.working.json";
  protected readonly requiresFileReservation = true;

  protected async processTask(taskId: string, request: StageEnvelope): Promise<void> {
    const startedAt = nowIso();
    const config = await loadResolvedProjectConfig();
    const prompt = await loadPromptFile("synx-devops-expert.md").catch(() => DEVOPS_EXPERT_DEFAULT_PROMPT);
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
      stage: "synx-devops-expert",
      requesterAgent: this.agent,
      taskType: baseInput.task.typeHint,
      previousStage: baseInput.previousStage,
      errorContext: baseInput.task.rawRequest,
      targetTechnology: "Docker GitHub Actions CI/CD Terraform Kubernetes Nginx",
      specificQuestion: `What is the safest infrastructure/CI/CD implementation for: ${baseInput.task.title}?`,
      repeatedIssues: [],
    });

    if (researchDecision.status === "abort_to_human") {
      const escalationOutput = {
        decision: "research_loop_detected",
        reason: researchDecision.abortReason || "Research anti-loop guard triggered.",
        triggerReasons: researchDecision.triggerReasons,
        researchContext: researchDecision.context,
      };
      const escalationView = `# HANDOFF\n\n## Agent\nSynx DevOps Expert\n\n## Decision\nEscalated to human review – Researcher loop guard triggered.\n\n## Reason\n${researchDecision.abortReason || "Research repeated while uncertainty persisted."}\n\n## Next\nHuman Review\n`;
      await this.finishStage({
        taskId,
        stage: "synx-devops-expert",
        doneFileName: DONE_FILE_NAMES.synxDevopsExpert,
        viewFileName: "04-synx-devops-expert.md",
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

    const devopsContract = `
SYNX DEVOPS EXPERT – EXECUTION CONTRACT:
- Stack: Docker, GitHub Actions, CI/CD pipelines, Terraform, Kubernetes, Nginx, cloud infrastructure.
- Infrastructure-as-code: ALL infra changes must be declarative (YAML, HCL, Dockerfile). No ad-hoc scripts without IaC backing.
- Security: enforce least-privilege IAM/RBAC, secrets via env vars or secret managers (never hardcoded), image scanning.
- Pipelines: prefer fast feedback loops; separate lint/test/build/deploy stages; always include rollback steps for deployments.
- Idempotency: all infra changes must be safe to re-run. Avoid destructive operations unless explicitly requested.
- Output format: same builder JSON shape with "nextAgent": "Synx Code Reviewer".
`;

    const roleContract = buildAgentRoleContract("Synx DevOps Expert", {
      stage: "synx-devops-expert",
      taskTypeHint: baseInput.task.typeHint,
      qaAttempt: qaHandoffContext?.attempt ?? 0,
      suggestedChain: baseInput.suggestedChain,
      projectMemoryContext: baseInput.projectMemory
        ? formatProjectMemoryForContext(baseInput.projectMemory)
        : undefined,
    });

    const modelInput = {
      ...baseInput,
      workspaceContext,
      upstreamHandoff: { projectProfile, featureBrief, symbolContracts },
      researchContext: researchDecision.context,
    };

    const systemPrompt = `${prompt.replace("{{INPUT_JSON}}", JSON.stringify(modelInput, null, 2))}\n\n${roleContract}\n\n${devopsContract}${researchContextTag ? `\n\n${researchContextTag}` : ""}`;

    const result = await provider.generateStructured({
      agent: "Synx DevOps Expert",
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
    const applied = await applyWorkspaceEdits({ workspaceRoot, edits: output.edits, taskId });
    const gitChangedFiles = await getGitChangedFiles(workspaceRoot);
    const effectiveChanged = unique([...applied.changedFiles, ...gitChangedFiles.filter((f) => !gitChangedBefore.includes(f))]);

    if (!effectiveChanged.length && !gitChangedFiles.length) {
      throw new Error("Synx DevOps Expert completed but no code changes were detected.");
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

    const view = `# HANDOFF\n\n## Agent\nSynx DevOps Expert\n\n## Summary\n${output.implementationSummary}\n\n## Files Changed\n${output.filesChanged.map((f) => `- ${f}`).join("\n") || "- [none]"}\n\n## Changes Made\n${output.changesMade.map((c) => `- ${c}`).join("\n") || "- [none]"}\n\n## Technical Risks\n${output.technicalRisks.map((r) => `- ${r}`).join("\n") || "- [none]"}\n\n## Next\nSynx Code Reviewer\n`;

    // Force nextAgent to "Synx Code Reviewer" regardless of model output
    output.nextAgent = "Synx Code Reviewer";

    await this.finishStage({
      taskId,
      stage: "synx-devops-expert",
      doneFileName: DONE_FILE_NAMES.synxDevopsExpert,
      viewFileName: "04-synx-devops-expert.md",
      viewContent: view,
      output,
      nextAgent: "Synx Code Reviewer",
      nextStage: "synx-code-reviewer",
      nextRequestFileName: STAGE_FILE_NAMES.synxCodeReviewer,
      nextInputRef: `done/${DONE_FILE_NAMES.synxDevopsExpert}`,
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
