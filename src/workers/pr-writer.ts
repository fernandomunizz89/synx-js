import { DONE_FILE_NAMES, STAGE_FILE_NAMES } from "../lib/constants.js";
import { finalizeForHumanReview } from "../lib/task.js";
import type { StageEnvelope } from "../lib/types.js";
import { nowIso } from "../lib/utils.js";
import { WorkerBase } from "./base.js";

export class PrWriterWorker extends WorkerBase {
  readonly agent = "PR Writer" as const;
  readonly requestFileName = STAGE_FILE_NAMES.pr;
  readonly workingFileName = "07-pr.working.json";

  protected async processTask(taskId: string, request: StageEnvelope): Promise<void> {
    const startedAt = nowIso();
    await this.fakeWork(250, 900);

    const output = {
      summary: "Mock PR summary generated from prior stages.",
      whatWasDone: ["Summarized the scoped changes.", "Captured risks and test plan."],
      testPlan: ["Run the main scenario.", "Run the negative scenario.", "Check one adjacent regression path."],
      nextAgent: "Human Review",
    };

    const view = `# HANDOFF

## Agent
PR Writer

## Summary
${output.summary}

## What was done
- ${output.whatWasDone[0]}
- ${output.whatWasDone[1]}

## Test Plan
1. ${output.testPlan[0]}
2. ${output.testPlan[1]}
3. ${output.testPlan[2]}

## Next
Human Review
`;

    await this.finishStage({
      taskId,
      stage: "pr",
      doneFileName: DONE_FILE_NAMES.pr,
      viewFileName: "07-pr.md",
      viewContent: view,
      output,
      humanApprovalRequired: true,
      startedAt,
      provider: "mock",
      model: "mock-pr-v1",
      parseRetries: 0,
      validationPassed: true,
    });

    await finalizeForHumanReview(taskId);
  }
}
