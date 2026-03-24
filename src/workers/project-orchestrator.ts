import { DONE_FILE_NAMES, STAGE_FILE_NAMES } from "../lib/constants.js";
import { taskDir } from "../lib/paths.js";
import { logDaemon, logTaskEvent } from "../lib/logging.js";
import { nowIso } from "../lib/utils.js";
import { WorkerBase } from "./base.js";
import type { StageEnvelope } from "../lib/types.js";

const ORCHESTRATOR_AGENT = "Project Orchestrator" as const;

/**
 * Project intake stage.
 *
 * Receives a project-type task, logs it, and immediately hands off to the
 * pre-build planning squad (Product Strategist → Requirements Analyst →
 * UX Flow Designer → Solution Architect → Delivery Planner → Decomposer).
 *
 * No LLM call is made here. Planning and decomposition are owned by the
 * five specialist workers and ProjectDecomposer respectively.
 */
export class ProjectOrchestrator extends WorkerBase {
  readonly agent = ORCHESTRATOR_AGENT;
  readonly requestFileName = STAGE_FILE_NAMES.projectOrchestrator;
  readonly workingFileName = "00-project-orchestrator.working.json";

  protected async processTask(taskId: string, request: StageEnvelope): Promise<void> {
    const startedAt = nowIso();
    const input = await this.loadTaskInput(taskId);

    await logTaskEvent(
      taskDir(taskId),
      `Project Orchestrator: forwarding "${input.title}" to the pre-build planning squad...`,
    );
    await logDaemon(`ProjectOrchestrator: intake for ${taskId}`);

    await this.finishStage({
      taskId,
      stage: request.stage,
      doneFileName: DONE_FILE_NAMES.projectOrchestrator,
      viewFileName: "00-project-orchestrator.view.md",
      viewContent: [
        `# Project Intake: ${input.title}`,
        "",
        "Request received. Forwarding to the pre-build planning squad.",
        "",
        "## Planning chain",
        "1. Synx Product Strategist — product brief and scope",
        "2. Synx Requirements Analyst — requirements and acceptance criteria",
        "3. Synx UX Flow Designer — user journeys and screen list",
        "4. Synx Solution Architect — technical design",
        "5. Synx Delivery Planner — milestones and delivery constraints",
        "6. Project Orchestrator (decompose) — subtask creation",
      ].join("\n"),
      output: { stage: "intake", title: input.title, project: input.project },
      nextAgent: "Synx Product Strategist",
      nextStage: "synx-product-strategist",
      nextRequestFileName: STAGE_FILE_NAMES.synxProductStrategist,
      nextInputRef: "input/new-task.json",
      startedAt,
    });

    await logTaskEvent(taskDir(taskId), "Project Orchestrator: intake complete. Planning squad queued.");
  }
}
