import path from "node:path";
import { DONE_FILE_NAMES, STAGE_FILE_NAMES } from "../../lib/constants.js";
import { loadResolvedProjectConfig, loadPromptFile, resolveProviderConfigForAgent } from "../../lib/config.js";
import { buildAgentRoleContract } from "../../lib/agent-role-contract.js";
import { exists, readJson } from "../../lib/fs.js";
import { taskDir } from "../../lib/paths.js";
import { securityAuditOutputSchema } from "../../lib/schema.js";
import { loadTaskMeta } from "../../lib/task.js";
import type { AgentName, StageEnvelope } from "../../lib/types.js";
import { createProvider } from "../../providers/factory.js";
import { nowIso } from "../../lib/utils.js";
import { WorkerBase } from "../base.js";

const SECURITY_AUDITOR_DEFAULT_PROMPT = `You are the Synx Security Auditor, an application security specialist.

Your task input is provided as JSON. Analyse it carefully and perform a thorough security audit.

DOMAIN: OWASP Top 10, secrets scanning, input validation, authentication/authorization flaws,
injection vulnerabilities (SQL, NoSQL, command, LDAP), XSS, CSRF, SSRF, insecure deserialization,
broken access control, security misconfiguration, and sensitive data exposure.

RULES:
- Check every changed file for hardcoded secrets, tokens, passwords, and API keys.
- Validate all input entry points: HTTP endpoints, query params, headers, request bodies.
- Verify authentication guards are applied to all protected routes.
- Identify insecure direct object references (IDOR) and missing authorization checks.
- Flag any use of eval(), dangerouslySetInnerHTML, or other injection sinks without sanitization.
- Report CVE identifiers when applicable.

OUTPUT: Respond with a single JSON object matching the securityAuditOutputSchema.
{{INPUT_JSON}}`;

/**
 * Synx Security Auditor (Stage 08)
 *
 * Application security gate between QA and human review.
 * Performs OWASP Top 10 checks, secrets scanning, and input validation auditing.
 * Routes back to the originating expert on critical/high vulnerabilities (up to 2 times),
 * then advances to Human Review.
 *
 * Prompt file: .ai-agents/prompts/synx-security-auditor.md
 * (Create this file in your project's .ai-agents/prompts/ directory.)
 */
export class SynxSecurityAuditor extends WorkerBase {
  readonly agent = "Synx Security Auditor" as const;
  readonly requestFileName = STAGE_FILE_NAMES.synxSecurityAuditor;
  readonly workingFileName = "08-synx-security-auditor.working.json";

  protected async processTask(taskId: string, request: StageEnvelope): Promise<void> {
    const startedAt = nowIso();
    const config = await loadResolvedProjectConfig();
    const prompt = await loadPromptFile("synx-security-auditor.md").catch(() => SECURITY_AUDITOR_DEFAULT_PROMPT);
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
    if (request.output && typeof request.output === "object" && "securityAuditRerouteCount" in request.output) {
      const raw = (request.output as Record<string, unknown>).securityAuditRerouteCount;
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

    // Also load Code Reviewer output if available
    let codeReviewOutput: unknown = null;
    const codeReviewerDonePath = path.join(doneDir, DONE_FILE_NAMES.synxCodeReviewer);
    if (await exists(codeReviewerDonePath)) {
      try {
        const envelope = await readJson<{ output?: unknown }>(codeReviewerDonePath);
        codeReviewOutput = envelope.output ?? null;
      } catch {
        codeReviewOutput = null;
      }
    }

    const roleContract = buildAgentRoleContract("Synx Security Auditor", {
      stage: "synx-security-auditor",
      taskTypeHint: baseInput.task.typeHint,
    });

    const auditContract = `
SYNX SECURITY AUDITOR – EXECUTION CONTRACT:
- OWASP Top 10: injection, broken auth, XSS, IDOR, security misconfig, vulnerable components, logging failures, SSRF.
- Secrets scan: flag any hardcoded token, password, API key, or credential in source code.
- Input validation: every public-facing input must be validated/sanitized before use.
- Access control: all protected routes must have authentication and authorization guards.
- auditPassed: true if no critical/high vulnerabilities found.
- blockedReason: set when auditPassed=false with a clear explanation of blocking issues.
- Output format: securityAuditOutputSchema JSON.
`;

    const modelInput = {
      ...baseInput,
      expertDoneOutput,
      codeReviewOutput,
      previousExpert,
      rerouteCount,
    };

    const systemPrompt = `${prompt.replace("{{INPUT_JSON}}", JSON.stringify(modelInput, null, 2))}\n\n${roleContract}\n\n${auditContract}`;

    const result = await provider.generateStructured({
      agent: "Synx Security Auditor",
      taskId,
      stage: request.stage,
      taskType: baseInput.task.typeHint,
      systemPrompt,
      input: modelInput,
      expectedJsonSchemaDescription:
        '{ "auditPassed": true, "vulnerabilities": [{ "severity": "critical | high | medium | low | info", "cve": "string", "category": "string", "description": "string", "file": "string", "line": 10, "fix": "string" }], "summary": "string", "blockedReason": "string", "owaspCategories": ["string"] }',
    });

    const output = securityAuditOutputSchema.parse(result.parsed);

    // Determine blocking vulnerabilities (critical or high severity)
    const blockingVulns = output.vulnerabilities.filter((v) => v.severity === "critical" || v.severity === "high");
    const MAX_REROUTE = 2;
    const shouldRerouteToExpert = !output.auditPassed && blockingVulns.length > 0 && rerouteCount < MAX_REROUTE && previousExpert !== null;

    const vulnsSummary = output.vulnerabilities
      .map((v) => `[${v.severity.toUpperCase()}] ${v.file ?? "unknown"}${v.line ? `:${v.line}` : ""} – ${v.description}`)
      .join("\n") || "[none]";

    const view = `# HANDOFF\n\n## Agent\nSynx Security Auditor\n\n## Audit Result\n${output.auditPassed ? "PASSED" : "BLOCKED"}\n\n## Summary\n${output.summary}\n\n## Vulnerabilities\n${vulnsSummary}\n\n## OWASP Categories\n${output.owaspCategories.map((c) => `- ${c}`).join("\n") || "- [none]"}\n\n## Next\n${shouldRerouteToExpert ? String(previousExpert) : "Human Review"}\n`;

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
        stage: "synx-security-auditor",
        doneFileName: DONE_FILE_NAMES.synxSecurityAuditor,
        viewFileName: "08-synx-security-auditor.md",
        viewContent: view,
        output: {
          ...output,
          securityAuditRerouteCount: rerouteCount + 1,
          securityAuditBlockingVulns: blockingVulns,
        },
        nextAgent: previousExpert,
        nextStage: expertRouting.stage,
        nextRequestFileName: expertRouting.fileName,
        nextInputRef: `done/${DONE_FILE_NAMES.synxSecurityAuditor}`,
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

    // Advance to Human Review
    await this.finishStage({
      taskId,
      stage: "synx-security-auditor",
      doneFileName: DONE_FILE_NAMES.synxSecurityAuditor,
      viewFileName: "08-synx-security-auditor.md",
      viewContent: view,
      output: {
        ...output,
        securityAuditRerouteCount: rerouteCount,
        advancedDespiteVulnerabilities: !output.auditPassed && rerouteCount >= MAX_REROUTE,
      },
      nextAgent: "Human Review",
      humanApprovalRequired: true,
      nextInputRef: `done/${DONE_FILE_NAMES.synxSecurityAuditor}`,
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
