import { DONE_FILE_NAMES, STAGE_FILE_NAMES } from "../../lib/constants.js";
import { collectReadinessReport } from "../../lib/readiness.js";
import { nowIso } from "../../lib/utils.js";
import { WorkerBase } from "../base.js";
import type { StageEnvelope } from "../../lib/types.js";
import { runProjectChecks } from "../../lib/workspace-tools.js";
import { isGitRepository, readPackageScripts, selectPackageManager } from "../../lib/command-runner.js";
import { exists } from "../../lib/fs.js";
import path from "node:path";
import { activateStabilizationMode } from "../../lib/release-state.js";
import { ARTIFACT_FILES, saveTaskArtifact } from "../../lib/task-artifacts.js";

interface ReleaseCandidateOutput {
  decision: "ready_for_release" | "release_blocked";
  releaseSummary: string;
  readiness: {
    ok: boolean;
    issues: Array<{ severity: "error" | "warning"; message: string }>;
  };
  packagingPlan: {
    packageManager: string;
    strategy: "container-image" | "build-artifacts" | "source-bundle";
    commands: string[];
    previewPlan: string[];
  };
  smokeChecks: Array<{
    command: string;
    status: "passed" | "failed" | "skipped";
    exitCode: number | null;
    diagnostics: string[];
  }>;
  rollbackPlan: {
    method: string;
    commandHint: string;
    notes: string[];
  };
  stabilizationMode: {
    enabled: boolean;
    windowHours: number;
    focusAreas: string[];
  };
  releaseSignals: string[];
  nextAgent: "Synx Incident Triage" | "Synx Customer Feedback Synthesizer";
}

export class SynxReleaseManager extends WorkerBase {
  readonly agent = "Synx Release Manager" as const;
  readonly requestFileName = STAGE_FILE_NAMES.synxReleaseManager;
  readonly workingFileName = "09-synx-release-manager.working.json";

  protected async processTask(taskId: string, request: StageEnvelope): Promise<void> {
    const startedAt = nowIso();
    const baseInput = await this.buildAgentInput(taskId, request);
    const workspaceRoot = process.cwd();
    const readiness = await collectReadinessReport({ includeProviderChecks: true });
    const scripts = await readPackageScripts(workspaceRoot);
    const smokeChecks = await runProjectChecks({
      workspaceRoot,
      includeE2E: false,
      changedFiles: [],
      timeoutMsPerCheck: 90_000,
    });

    const hasBlockingReadinessIssue = readiness.issues.some((issue) => issue.severity === "error");
    const hasFailedSmokeChecks = smokeChecks.some((check) => check.status === "failed");
    const hasExecutableSmokeSignal = smokeChecks.some((check) => check.status === "passed" || check.status === "failed");
    const releaseBlocked = hasBlockingReadinessIssue || hasFailedSmokeChecks || !hasExecutableSmokeSignal;

    const hasDockerfile = await exists(path.join(workspaceRoot, "Dockerfile"));
    const packageManager = selectPackageManager(workspaceRoot);
    const packagingStrategy: ReleaseCandidateOutput["packagingPlan"]["strategy"] =
      hasDockerfile ? "container-image" : (scripts.build ? "build-artifacts" : "source-bundle");
    const packagingCommands = hasDockerfile
      ? ["docker build -t <image>:<tag> .", "docker run --rm <image>:<tag>"]
      : scripts.build
        ? [`${packageManager} run build`]
        : ["git archive --format=tar.gz -o release.tar.gz HEAD"];
    const previewPlan = [
      scripts.dev ? `${packageManager} run dev` : "No dev script detected for preview runtime.",
      scripts.test ? `${packageManager} run test` : "No test script detected for preview runtime.",
    ];

    const isGit = await isGitRepository(workspaceRoot);
    const rollbackPlan = {
      method: isGit ? "git-restore" : "manual-restore",
      commandHint: isGit ? "synx reprove --rollback task --reason \"Release smoke failed\"" : "No git repository detected. Use backup/CI artifacts to restore.",
      notes: isGit
        ? [
            "Task-scoped rollback is available for tracked and untracked files captured in implementation artifacts.",
            "For production deploy rollback, restore last known-good artifact or previous deployment revision.",
          ]
        : ["Enable git history or immutable deployment artifacts for safer rollback."],
    };

    const previousChangedFiles =
      (baseInput.previousStage && typeof baseInput.previousStage === "object" && "output" in baseInput.previousStage
        ? (((baseInput.previousStage as { output?: { changedFiles?: string[] } }).output?.changedFiles) || [])
        : []);
    const focusAreas = [
      ...previousChangedFiles.slice(0, 5),
      ...smokeChecks.filter((check) => check.status !== "passed").map((check) => check.command).slice(0, 3),
    ];

    const output: ReleaseCandidateOutput = {
      decision: releaseBlocked ? "release_blocked" : "ready_for_release",
      releaseSummary: releaseBlocked
        ? "Release candidate blocked: readiness and/or smoke test gates failed."
        : "Release candidate prepared with readiness checks, smoke validation, packaging guidance, and rollback instructions.",
      readiness,
      packagingPlan: {
        packageManager,
        strategy: packagingStrategy,
        commands: packagingCommands,
        previewPlan,
      },
      smokeChecks: smokeChecks.map((check) => ({
        command: check.command,
        status: check.status,
        exitCode: check.exitCode,
        diagnostics: (check.diagnostics || []).slice(0, 4),
      })),
      rollbackPlan,
      stabilizationMode: {
        enabled: !releaseBlocked,
        windowHours: 24,
        focusAreas: focusAreas.slice(0, 8),
      },
      releaseSignals: [
        hasBlockingReadinessIssue ? "Readiness errors present." : "Readiness checks passed.",
        hasFailedSmokeChecks ? "At least one smoke check failed." : "Smoke checks did not fail.",
        hasExecutableSmokeSignal ? "Executable smoke evidence available." : "No executable smoke evidence available.",
      ],
      nextAgent: releaseBlocked ? "Synx Incident Triage" : "Synx Customer Feedback Synthesizer",
    };

    await saveTaskArtifact(taskId, ARTIFACT_FILES.releaseCandidate, output);

    if (!releaseBlocked) {
      await activateStabilizationMode({
        taskId,
        summary: "Release candidate accepted. Stabilization mode enabled for post-release monitoring.",
        focusAreas: output.stabilizationMode.focusAreas,
        windowHours: output.stabilizationMode.windowHours,
      });
    }

    const nextStage = output.nextAgent === "Synx Incident Triage"
      ? "synx-incident-triage"
      : "synx-customer-feedback-synthesizer";
    const nextRequestFileName = output.nextAgent === "Synx Incident Triage"
      ? STAGE_FILE_NAMES.synxIncidentTriage
      : STAGE_FILE_NAMES.synxFeedbackSynth;

    const view = `# HANDOFF

## Agent
Synx Release Manager

## Decision
${output.decision}

## Summary
${output.releaseSummary}

## Readiness
${output.readiness.issues.length
    ? output.readiness.issues.map((issue) => `- [${issue.severity}] ${issue.message}`).join("\n")
    : "- [ok] no readiness issues found"}

## Packaging Plan
- Strategy: ${output.packagingPlan.strategy}
- Package manager: ${output.packagingPlan.packageManager}
${output.packagingPlan.commands.map((command) => `- ${command}`).join("\n")}

## Smoke Checks
${output.smokeChecks.length
    ? output.smokeChecks.map((check) => `- ${check.status.toUpperCase()} | ${check.command} | exit=${check.exitCode ?? "null"}`).join("\n")
    : "- [none]"}

## Rollback Plan
- Method: ${output.rollbackPlan.method}
- Command hint: ${output.rollbackPlan.commandHint}
${output.rollbackPlan.notes.map((note) => `- ${note}`).join("\n")}

## Stabilization Mode
- Enabled: ${output.stabilizationMode.enabled ? "yes" : "no"}
- Window: ${output.stabilizationMode.windowHours}h
${output.stabilizationMode.focusAreas.length
    ? output.stabilizationMode.focusAreas.map((item) => `- ${item}`).join("\n")
    : "- [none]"}

## Next
${output.nextAgent}
`;

    await this.finishStage({
      taskId,
      stage: "synx-release-manager",
      doneFileName: DONE_FILE_NAMES.synxReleaseManager,
      viewFileName: "09-synx-release-manager.md",
      viewContent: view,
      output,
      nextAgent: output.nextAgent,
      nextStage,
      nextRequestFileName,
      nextInputRef: `done/${DONE_FILE_NAMES.synxReleaseManager}`,
      startedAt,
    });
  }
}
