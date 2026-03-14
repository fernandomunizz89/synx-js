import { DONE_FILE_NAMES, STAGE_FILE_NAMES } from "../lib/constants.js";
import type { StageEnvelope } from "../lib/types.js";
import { nowIso } from "../lib/utils.js";
import { WorkerBase } from "./base.js";

export class QaWorker extends WorkerBase {
  readonly agent = "QA Validator" as const;
  readonly requestFileName = STAGE_FILE_NAMES.qa;
  readonly workingFileName = "06-qa.working.json";

  protected async processTask(taskId: string, request: StageEnvelope): Promise<void> {
    const startedAt = nowIso();
    await this.fakeWork(350, 1200);

const output = {
  mainScenarios: ["Happy path", "Invalid input path", "Regression around adjacent behavior"],
  acceptanceChecklist: ["Expected behavior is met.", "Invalid behavior is blocked.", "No obvious regression is observed."],
  nextAgent: "PR Writer",
};

const view = `# HANDOFF

## Agent
QA Validator

## Main Scenarios
1. ${output.mainScenarios[0]}
2. ${output.mainScenarios[1]}
3. ${output.mainScenarios[2]}

## Acceptance Checklist
- [ ] ${output.acceptanceChecklist[0]}
- [ ] ${output.acceptanceChecklist[1]}
- [ ] ${output.acceptanceChecklist[2]}

## Next
PR Writer
`;

    await this.finishStage({
      taskId,
      stage: "qa",
      doneFileName: DONE_FILE_NAMES.qa,
      viewFileName: "06-qa.md",
      viewContent: view,
      output,
      nextAgent: "PR Writer",
      nextStage: "pr",
      nextRequestFileName: STAGE_FILE_NAMES.pr,
      nextInputRef: `done/${DONE_FILE_NAMES.qa}`,
      startedAt,
      provider: "mock",
      model: "mock-qa-v1",
      parseRetries: 0,
      validationPassed: true,
    });
  }
}
