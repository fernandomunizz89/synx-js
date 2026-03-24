import { DONE_FILE_NAMES, STAGE_FILE_NAMES } from "../../lib/constants.js";
import { nowIso } from "../../lib/utils.js";
import { WorkerBase } from "../base.js";
import type { StageEnvelope } from "../../lib/types.js";
import { recordReleaseIncident } from "../../lib/release-state.js";
import { ARTIFACT_FILES, saveTaskArtifact } from "../../lib/task-artifacts.js";
import { unique } from "../../lib/text-utils.js";

interface IncidentTriageOutput {
  severity: "low" | "medium" | "high" | "critical";
  summary: string;
  suspectedComponents: string[];
  primarySignals: string[];
  immediateActions: string[];
  rollbackRecommended: boolean;
  rollbackCommandHint: string;
  nextAgent: "Synx Customer Feedback Synthesizer";
}

function inferSeverity(signals: string[]): IncidentTriageOutput["severity"] {
  const combined = signals.join("\n").toLowerCase();
  if (/readiness errors present|smoke check failed|exit=1|exit=2|timed out/.test(combined)) return "high";
  if (/warning|skipped|no executable smoke evidence/.test(combined)) return "medium";
  return "low";
}

export class SynxIncidentTriage extends WorkerBase {
  readonly agent = "Synx Incident Triage" as const;
  readonly requestFileName = STAGE_FILE_NAMES.synxIncidentTriage;
  readonly workingFileName = "10-synx-incident-triage.working.json";

  protected async processTask(taskId: string, request: StageEnvelope): Promise<void> {
    const startedAt = nowIso();
    const baseInput = await this.buildAgentInput(taskId, request);
    const previousOutput = (
      baseInput.previousStage
      && typeof baseInput.previousStage === "object"
      && "output" in baseInput.previousStage
      && typeof (baseInput.previousStage as { output?: unknown }).output === "object"
      ? (baseInput.previousStage as { output?: Record<string, unknown> }).output
      : {}
    ) || {};

    const releaseSignals = Array.isArray(previousOutput.releaseSignals)
      ? previousOutput.releaseSignals.filter((item): item is string => typeof item === "string")
      : [];
    const smokeChecks = Array.isArray(previousOutput.smokeChecks)
      ? previousOutput.smokeChecks as Array<{ command?: string; status?: string; diagnostics?: string[] }>
      : [];
    const readinessIssues = previousOutput.readiness && typeof previousOutput.readiness === "object"
      ? (((previousOutput.readiness as { issues?: unknown }).issues as Array<{ message?: string; severity?: string }>) || [])
      : [];

    const failedChecks = smokeChecks.filter((check) => check.status === "failed");
    const suspectedComponents = unique([
      ...failedChecks.map((check) => String(check.command || "").trim()).filter(Boolean),
      ...readinessIssues.map((issue) => String(issue.message || "").trim()).filter(Boolean),
    ]).slice(0, 8);

    const signals = unique([
      ...releaseSignals,
      ...failedChecks.map((check) => `Smoke failed: ${String(check.command || "").trim() || "unknown command"}`),
      ...readinessIssues.map((issue) => `[${String(issue.severity || "error")}] ${String(issue.message || "").trim()}`),
    ]).slice(0, 12);
    const severity = inferSeverity(signals);
    const rollbackRecommended = failedChecks.length > 0 || readinessIssues.some((issue) => issue.severity === "error");

    const output: IncidentTriageOutput = {
      severity,
      summary: "Release validation failed. Incident intake generated with containment and remediation guidance.",
      suspectedComponents,
      primarySignals: signals,
      immediateActions: [
        rollbackRecommended
          ? "Execute rollback path for the release candidate before expanding rollout."
          : "Pause rollout and perform targeted validation before proceeding.",
        "Open a remediation task referencing this incident intake artifact.",
        "Re-run smoke checks after remediation with the same command set.",
      ],
      rollbackRecommended,
      rollbackCommandHint: rollbackRecommended
        ? 'synx reprove --rollback task --reason "Release incident triage rollback"'
        : "Rollback not immediately required based on current signal strength.",
      nextAgent: "Synx Customer Feedback Synthesizer",
    };

    await saveTaskArtifact(taskId, ARTIFACT_FILES.productionIncidentIntake, output);
    await recordReleaseIncident({
      taskId,
      summary: output.summary,
      severity: output.severity,
      focusAreas: output.suspectedComponents,
    });

    const view = `# HANDOFF

## Agent
Synx Incident Triage

## Severity
${output.severity}

## Summary
${output.summary}

## Primary Signals
${output.primarySignals.length ? output.primarySignals.map((signal) => `- ${signal}`).join("\n") : "- [none]"}

## Suspected Components
${output.suspectedComponents.length ? output.suspectedComponents.map((item) => `- ${item}`).join("\n") : "- [none]"}

## Immediate Actions
${output.immediateActions.map((action) => `- ${action}`).join("\n")}

## Rollback
- Recommended: ${output.rollbackRecommended ? "yes" : "no"}
- Command hint: ${output.rollbackCommandHint}

## Next
${output.nextAgent}
`;

    await this.finishStage({
      taskId,
      stage: "synx-incident-triage",
      doneFileName: DONE_FILE_NAMES.synxIncidentTriage,
      viewFileName: "10-synx-incident-triage.md",
      viewContent: view,
      output,
      nextAgent: output.nextAgent,
      nextStage: "synx-customer-feedback-synthesizer",
      nextRequestFileName: STAGE_FILE_NAMES.synxFeedbackSynth,
      nextInputRef: `done/${DONE_FILE_NAMES.synxIncidentTriage}`,
      startedAt,
    });
  }
}
