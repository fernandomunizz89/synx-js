import { DONE_FILE_NAMES, STAGE_FILE_NAMES } from "../lib/constants.js";
import type { StageEnvelope } from "../lib/types.js";
import { nowIso } from "../lib/utils.js";
import { WorkerBase } from "./base.js";

export class BugInvestigatorWorker extends WorkerBase {
  readonly agent = "Bug Investigator" as const;
  readonly requestFileName = STAGE_FILE_NAMES.bugInvestigator;
  readonly workingFileName = "02b-bug-investigator.working.json";

  protected async processTask(taskId: string, request: StageEnvelope): Promise<void> {
    const startedAt = nowIso();
    await this.fakeWork(350, 1200);

const output = {
  symptom: "Observed behavior differs from expected flow.",
  expectedBehavior: "The UI or state should behave consistently after the relevant action.",
  likelyCauses: ["State not reset correctly.", "Stale persisted data.", "Lifecycle timing mismatch."],
  suspectAreas: ["state management", "storage access", "re-entry lifecycle"],
  nextAgent: "Feature Builder",
};

const view = `# HANDOFF

## Agent
Bug Investigator

## Symptom
${output.symptom}

## Expected Behavior
${output.expectedBehavior}

## Likely Causes
1. ${output.likelyCauses[0]}
2. ${output.likelyCauses[1]}
3. ${output.likelyCauses[2]}

## Suspect Areas
- ${output.suspectAreas[0]}
- ${output.suspectAreas[1]}
- ${output.suspectAreas[2]}

## Next
Feature Builder
`;

    await this.finishStage({
      taskId,
      stage: "bug-investigator",
      doneFileName: DONE_FILE_NAMES.bugInvestigator,
      viewFileName: "02b-bug-investigator.md",
      viewContent: view,
      output,
      nextAgent: "Feature Builder",
      nextStage: "builder",
      nextRequestFileName: STAGE_FILE_NAMES.builder,
      nextInputRef: `done/${DONE_FILE_NAMES.bugInvestigator}`,
      startedAt,
      provider: "mock",
      model: "mock-bug-investigator-v1",
      parseRetries: 0,
      validationPassed: true,
    });
  }
}
