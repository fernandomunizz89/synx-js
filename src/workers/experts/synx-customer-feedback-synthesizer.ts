import { DONE_FILE_NAMES } from "../../lib/constants.js";
import { nowIso } from "../../lib/utils.js";
import { WorkerBase } from "../base.js";
import type { StageEnvelope } from "../../lib/types.js";
import { STAGE_FILE_NAMES } from "../../lib/constants.js";
import { ARTIFACT_FILES, loadTaskArtifact, saveTaskArtifact } from "../../lib/task-artifacts.js";
import { updateStabilizationFocus } from "../../lib/release-state.js";
import { uniqueNormalized } from "../../lib/text-utils.js";

interface FeedbackSynthesisOutput {
  summary: string;
  themes: string[];
  impactAssessment: string[];
  stabilizationChecklist: string[];
  followUpTasks: string[];
  nextAgent: "Human Review";
}

export class SynxCustomerFeedbackSynthesizer extends WorkerBase {
  readonly agent = "Synx Customer Feedback Synthesizer" as const;
  readonly requestFileName = STAGE_FILE_NAMES.synxFeedbackSynth;
  readonly workingFileName = "11-synx-customer-feedback-synthesizer.working.json";

  protected async processTask(taskId: string, request: StageEnvelope): Promise<void> {
    const startedAt = nowIso();
    const baseInput = await this.buildAgentInput(taskId, request);
    const releaseCandidate = await loadTaskArtifact<Record<string, unknown>>(taskId, ARTIFACT_FILES.releaseCandidate);
    const incidentIntake = await loadTaskArtifact<Record<string, unknown>>(taskId, ARTIFACT_FILES.productionIncidentIntake);
    const qaHistory = await loadTaskArtifact<{ entries?: Array<{ summary?: string; failures?: string[] }> }>(
      taskId,
      "qa-return-context-history.json",
    );

    const themes = uniqueNormalized([
      ...(Array.isArray(releaseCandidate?.releaseSignals) ? releaseCandidate.releaseSignals as string[] : []),
      ...(Array.isArray(incidentIntake?.primarySignals) ? incidentIntake.primarySignals as string[] : []),
      ...(qaHistory?.entries || []).flatMap((entry) => [entry.summary || "", ...(entry.failures || [])]),
    ]).slice(0, 8);

    const impactAssessment = uniqueNormalized([
      incidentIntake
        ? "Release validation surfaced incident-level risks that require stabilization monitoring."
        : "No incident intake registered; stabilization focuses on confidence-building and monitoring.",
      themes.length
        ? `Captured ${themes.length} recurring feedback/reliability signals for follow-up.`
        : "No strong recurring feedback themes were captured yet.",
      "Human review should verify launch readiness against rollback confidence and smoke evidence.",
    ]).slice(0, 6);

    const stabilizationChecklist = uniqueNormalized([
      "Monitor runtime errors and failed checks during the stabilization window.",
      "Track customer-impacting issues and convert each into scoped remediation tasks.",
      "Re-run smoke checks after any hotfix before marking release stable.",
      ...(incidentIntake ? ["Confirm rollback path remains executable until incident risk is cleared."] : []),
    ]).slice(0, 8);

    const followUpTasks = uniqueNormalized([
      ...(Array.isArray(incidentIntake?.suspectedComponents) ? (incidentIntake.suspectedComponents as string[]).map((item) => `Investigate: ${item}`) : []),
      ...themes.slice(0, 3).map((theme) => `Validate signal: ${theme}`),
    ]).slice(0, 8);

    const output: FeedbackSynthesisOutput = {
      summary: "Post-release feedback and validation signals were synthesized into a stabilization action plan.",
      themes,
      impactAssessment,
      stabilizationChecklist,
      followUpTasks,
      nextAgent: "Human Review",
    };

    await saveTaskArtifact(taskId, ARTIFACT_FILES.customerFeedbackSummary, output);
    await updateStabilizationFocus({
      taskId,
      summary: output.summary,
      focusAreas: uniqueNormalized([...output.themes, ...output.followUpTasks]).slice(0, 10),
    });

    const view = `# HANDOFF

## Agent
Synx Customer Feedback Synthesizer

## Summary
${output.summary}

## Themes
${output.themes.length ? output.themes.map((item) => `- ${item}`).join("\n") : "- [none]"}

## Impact Assessment
${output.impactAssessment.map((item) => `- ${item}`).join("\n")}

## Stabilization Checklist
${output.stabilizationChecklist.map((item) => `- ${item}`).join("\n")}

## Follow-up Tasks
${output.followUpTasks.length ? output.followUpTasks.map((item) => `- ${item}`).join("\n") : "- [none]"}

## Next
Human Review
`;

    await this.finishStage({
      taskId,
      stage: "synx-customer-feedback-synthesizer",
      doneFileName: DONE_FILE_NAMES.synxFeedbackSynth,
      viewFileName: "11-synx-customer-feedback-synthesizer.md",
      viewContent: view,
      output,
      humanApprovalRequired: true,
      nextInputRef: `done/${DONE_FILE_NAMES.synxFeedbackSynth}`,
      startedAt,
    });
  }
}
