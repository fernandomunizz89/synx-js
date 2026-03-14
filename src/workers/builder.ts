import { DONE_FILE_NAMES, STAGE_FILE_NAMES } from "../lib/constants.js";
import type { StageEnvelope } from "../lib/types.js";
import { nowIso } from "../lib/utils.js";
import { WorkerBase } from "./base.js";

export class BuilderWorker extends WorkerBase {
  readonly agent = "Feature Builder" as const;
  readonly requestFileName = STAGE_FILE_NAMES.builder;
  readonly workingFileName = "04-builder.working.json";

  protected async processTask(taskId: string, request: StageEnvelope): Promise<void> {
    const startedAt = nowIso();
    await this.fakeWork(350, 1200);

const output = {
  filesChanged: ["src/mock-file.ts", "src/mock-component.tsx"],
  changesMade: ["Applied scoped changes from the prior handoff.", "Kept unrelated modules untouched.", "Prepared review notes."],
  risks: ["Potential regression if adjacent logic shares the same dependency."],
  nextAgent: "Reviewer",
};

const view = `# HANDOFF

## Agent
Feature Builder

## Files Changed
- ${output.filesChanged[0]}
- ${output.filesChanged[1]}

## Changes Made
1. ${output.changesMade[0]}
2. ${output.changesMade[1]}
3. ${output.changesMade[2]}

## Risks
- ${output.risks[0]}

## Next
Reviewer
`;

    await this.finishStage({
      taskId,
      stage: "builder",
      doneFileName: DONE_FILE_NAMES.builder,
      viewFileName: "04-implementation.md",
      viewContent: view,
      output,
      nextAgent: "Reviewer",
      nextStage: "reviewer",
      nextRequestFileName: STAGE_FILE_NAMES.reviewer,
      nextInputRef: `done/${DONE_FILE_NAMES.builder}`,
      startedAt,
      provider: "mock",
      model: "mock-builder-v1",
      parseRetries: 0,
      validationPassed: true,
    });
  }
}
