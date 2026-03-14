import { DONE_FILE_NAMES, STAGE_FILE_NAMES } from "../lib/constants.js";
import type { StageEnvelope } from "../lib/types.js";
import { nowIso } from "../lib/utils.js";
import { WorkerBase } from "./base.js";

export class ReviewerWorker extends WorkerBase {
  readonly agent = "Reviewer" as const;
  readonly requestFileName = STAGE_FILE_NAMES.reviewer;
  readonly workingFileName = "05-reviewer.working.json";

  protected async processTask(taskId: string, request: StageEnvelope): Promise<void> {
    const startedAt = nowIso();
    await this.fakeWork(350, 1200);

const output = {
  whatLooksGood: ["The scope appears contained.", "The implementation summary is structured."],
  issuesFound: [],
  verdict: "Approved with adjustments",
  nextAgent: "QA Validator",
};

const view = `# HANDOFF

## Agent
Reviewer

## What Looks Good
- ${output.whatLooksGood[0]}
- ${output.whatLooksGood[1]}

## Issues Found
- [none in mock mode]

## Review Verdict
${output.verdict}

## Next
QA Validator
`;

    await this.finishStage({
      taskId,
      stage: "reviewer",
      doneFileName: DONE_FILE_NAMES.reviewer,
      viewFileName: "05-review.md",
      viewContent: view,
      output,
      nextAgent: "QA Validator",
      nextStage: "qa",
      nextRequestFileName: STAGE_FILE_NAMES.qa,
      nextInputRef: `done/${DONE_FILE_NAMES.reviewer}`,
      startedAt,
      provider: "mock",
      model: "mock-reviewer-v1",
      parseRetries: 0,
      validationPassed: true,
    });
  }
}
