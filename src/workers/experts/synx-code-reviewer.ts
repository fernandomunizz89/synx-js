import path from "node:path";
import { DONE_FILE_NAMES, STAGE_FILE_NAMES } from "../../lib/constants.js";
import { loadResolvedProjectConfig, loadPromptFile, resolveProviderConfigForAgent } from "../../lib/config.js";
import { buildAgentRoleContract } from "../../lib/agent-role-contract.js";
import { exists, readJson } from "../../lib/fs.js";
import { taskDir } from "../../lib/paths.js";
import { codeReviewOutputSchema } from "../../lib/schema.js";
import { loadTaskMeta } from "../../lib/task.js";
import type { AgentName, StageEnvelope } from "../../lib/types.js";
import { createProvider } from "../../providers/factory.js";
import { nowIso } from "../../lib/utils.js";
import { WorkerBase } from "../base.js";

/**
 * Synx Code Reviewer (Stage 07)
 *
 * Quality gate that sits between domain experts and the QA Engineer.
 * Reviews code quality, security, maintainability, and convention adherence.
 * Routes back to the originating expert on critical/high issues (up to 2 times),
 * then advances to QA with review notes attached.
 *
 * Prompt file: .ai-agents/prompts/synx-code-reviewer.md
 * (Create this file in your project's .ai-agents/prompts/ directory.)
 */
export class SynxCodeReviewer extends WorkerBase {
  readonly agent = "Synx Code Reviewer" as const;
  readonly requestFileName = STAGE_FILE_NAMES.synxCodeReviewer;
  readonly workingFileName = "07-synx-code-reviewer.working.json";

  protected async processTask(taskId: string, request: StageEnvelope): Promise<void> {
    const startedAt = nowIso();
    const config = await loadResolvedProjectConfig();
    const prompt = await loadPromptFile("synx-code-reviewer.md");
    const provider = createProvider(resolveProviderConfigForAgent(config, this.agent));
    const baseInput = await this.buildAgentInput(taskId, request);

    // Determine which expert produced the code by inspecting task history
    const taskMeta = await loadTaskMeta(taskId);
    const expertAgentNames: AgentName[] = [
      "Synx Front Expert",
      "Synx Mobile Expert",
      "Synx Back Expert",
      "Synx DevOps Expert",
      "Synx SEO Specialist",
    ];
    let previousExpert: AgentName | null = null;
    for (let i = taskMeta.history.length - 1; i >= 0; i--) {
      const agentName = taskMeta.history[i].agent as string;
      if (expertAgentNames.some((n) => n === agentName)) {
        previousExpert = agentName as AgentName;
        break;
      }
    }

    // Read re-route attempt count from the previous stage output metadata
    let rerouteCount = 0;
    if (request.output && typeof request.output === "object" && "codeReviewRerouteCount" in request.output) {
      const raw = (request.output as Record<string, unknown>).codeReviewRerouteCount;
      if (typeof raw === "number") rerouteCount = raw;
    }

    // Load the previous expert's done file for code context
    const doneDir = path.join(taskDir(taskId), "done");
    let expertDoneOutput: unknown = null;
    if (previousExpert) {
      const expertDoneFileMap: Record<string, string> = {
        "Synx Front Expert":   DONE_FILE_NAMES.synxFrontExpert,
        "Synx Mobile Expert":  DONE_FILE_NAMES.synxMobileExpert,
        "Synx Back Expert":    DONE_FILE_NAMES.synxBackExpert,
        "Synx DevOps Expert":  DONE_FILE_NAMES.synxDevopsExpert,
        "Synx SEO Specialist": DONE_FILE_NAMES.synxSeoSpecialist,
      };
      const doneFileName = expertDoneFileMap[previousExpert];
      if (doneFileName) {
        const donePath = path.join(doneDir, doneFileName);
        if (await exists(donePath)) {
          try {
            const envelope = await readJson<{ output?: unknown }>(donePath);
            expertDoneOutput = envelope.output ?? null;
          } catch {
            expertDoneOutput = null;
          }
        }
      }
    }

    const roleContract = buildAgentRoleContract("Synx Code Reviewer", {
      stage: "synx-code-reviewer",
      taskTypeHint: baseInput.task.typeHint,
    });

    const reviewContract = `
SYNX CODE REVIEWER – EXECUTION CONTRACT:
- Review scope: correctness, security, maintainability, performance, project conventions.
- Every issue must reference a specific file and provide an actionable suggestion.
- Severity: critical (blocks merge, must reroute), high (must reroute), medium (warn), low (suggestion).
- reviewPassed: true if no critical/high issues; false if any critical or high issue present.
- blockedReason: set when reviewPassed=false with a concise summary of blocking issues.
- Output format: codeReviewOutputSchema JSON.
`;

    const modelInput = {
      ...baseInput,
      expertDoneOutput,
      previousExpert,
      rerouteCount,
    };

    const systemPrompt = `${prompt.replace("{{INPUT_JSON}}", JSON.stringify(modelInput, null, 2))}\n\n${roleContract}\n\n${reviewContract}`;

    const result = await provider.generateStructured({
      agent: "Synx Code Reviewer",
      taskId,
      stage: request.stage,
      taskType: baseInput.task.typeHint,
      systemPrompt,
      input: modelInput,
      expectedJsonSchemaDescription:
        '{ "reviewPassed": true, "issues": [{ "file": "string", "line": 10, "severity": "critical | high | medium | low", "rule": "string", "message": "string", "suggestion": "string" }], "summary": "string", "blockedReason": "string" }',
    });

    const output = codeReviewOutputSchema.parse(result.parsed);

    // Determine blocking issues (critical or high severity)
    const blockingIssues = output.issues.filter((i) => i.severity === "critical" || i.severity === "high");
    const MAX_REROUTE = 2;
    const shouldRerouteToExpert = !output.reviewPassed && blockingIssues.length > 0 && rerouteCount < MAX_REROUTE && previousExpert !== null;

    const issuesSummary = output.issues
      .map((i) => `[${i.severity.toUpperCase()}] ${i.file}${i.line ? `:${i.line}` : ""} – ${i.message}`)
      .join("\n") || "[none]";

    const view = `# HANDOFF\n\n## Agent\nSynx Code Reviewer\n\n## Review Result\n${output.reviewPassed ? "PASSED" : "BLOCKED"}\n\n## Summary\n${output.summary}\n\n## Issues\n${issuesSummary}\n\n## Next\n${shouldRerouteToExpert ? String(previousExpert) : "Synx QA Engineer"}\n`;

    if (shouldRerouteToExpert && previousExpert !== null) {
      // Route back to expert: map to stage/file names
      const expertStageMap: Record<string, { stage: string; fileName: string }> = {
        "Synx Front Expert":   { stage: "synx-front-expert",    fileName: STAGE_FILE_NAMES.synxFrontExpert },
        "Synx Mobile Expert":  { stage: "synx-mobile-expert",   fileName: STAGE_FILE_NAMES.synxMobileExpert },
        "Synx Back Expert":    { stage: "synx-back-expert",     fileName: STAGE_FILE_NAMES.synxBackExpert },
        "Synx DevOps Expert":  { stage: "synx-devops-expert",   fileName: STAGE_FILE_NAMES.synxDevopsExpert },
        "Synx SEO Specialist": { stage: "synx-seo-specialist",  fileName: STAGE_FILE_NAMES.synxSeoSpecialist },
      };
      const expertRouting = expertStageMap[previousExpert];

      await this.finishStage({
        taskId,
        stage: "synx-code-reviewer",
        doneFileName: DONE_FILE_NAMES.synxCodeReviewer,
        viewFileName: "07-synx-code-reviewer.md",
        viewContent: view,
        output: {
          ...output,
          codeReviewRerouteCount: rerouteCount + 1,
          codeReviewBlockingIssues: blockingIssues,
        },
        nextAgent: previousExpert,
        nextStage: expertRouting.stage,
        nextRequestFileName: expertRouting.fileName,
        nextInputRef: `done/${DONE_FILE_NAMES.synxCodeReviewer}`,
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
      return;
    }

    // Advance to QA Engineer
    await this.finishStage({
      taskId,
      stage: "synx-code-reviewer",
      doneFileName: DONE_FILE_NAMES.synxCodeReviewer,
      viewFileName: "07-synx-code-reviewer.md",
      viewContent: view,
      output: {
        ...output,
        codeReviewRerouteCount: rerouteCount,
        advancedDespiteIssues: !output.reviewPassed && rerouteCount >= MAX_REROUTE,
      },
      nextAgent: "Synx QA Engineer",
      nextStage: "synx-qa-engineer",
      nextRequestFileName: STAGE_FILE_NAMES.synxQaEngineer,
      nextInputRef: `done/${DONE_FILE_NAMES.synxCodeReviewer}`,
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
