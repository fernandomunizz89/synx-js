import type { ProviderRequest, ProviderResult } from "../lib/types.js";
import type { LlmProvider } from "./provider.js";
import { sleep } from "../lib/utils.js";

export class MockProvider implements LlmProvider {
  constructor(private readonly model: string) {}

  async generateStructured(request: ProviderRequest): Promise<ProviderResult> {
    await sleep(250);

    const input = request.input as any;
    let parsed: unknown;

    switch (request.agent) {
      case "Dispatcher": {
        const sourceTask = input?.task || input;
        const normalizedType = (sourceTask?.typeHint || "Feature") as string;
        parsed = {
          type: normalizedType,
          goal: sourceTask?.rawRequest || sourceTask?.title || "Untitled task",
          context: `Project: ${sourceTask?.project || "[not set]"}`,
          knownFacts: [`The user requested: ${sourceTask?.rawRequest || sourceTask?.title || "Untitled task"}`],
          unknowns: ["Project-specific implementation details are unknown from the current input."],
          assumptions: [],
          constraints: ["Do not change unrelated code paths."],
          requiresHumanInput: false,
          nextAgent: normalizedType === "Bug" ? "Bug Investigator" : "Spec Planner",
        };
        break;
      }
      case "Spec Planner":
        parsed = {
          technicalContext: "Current technical context is unknown from available data.",
          knownFacts: ["The task was classified earlier in the pipeline."],
          unknowns: ["Exact files and data flow are not yet confirmed."],
          assumptions: [],
          requiresHumanInput: false,
          conditionalPlan: [
            "Locate the implementation related to the task goal.",
            "Apply the smallest safe change.",
            "Validate behavior did not regress.",
          ],
          edgeCases: ["Ambiguous scope", "Missing target file"],
          risks: ["Planning beyond confirmed facts"],
          validationCriteria: ["Change remains scoped to requested behavior"],
          nextAgent: "Feature Builder",
        };
        break;
      case "Bug Investigator":
        parsed = {
          symptomSummary: "Observed issue based on task description.",
          knownFacts: ["The user reported a bug-like behavior."],
          likelyCauses: ["Implementation does not match expected behavior."],
          investigationSteps: ["Locate relevant files.", "Apply minimal correction.", "Validate changes."],
          unknowns: ["Precise root cause before file inspection."],
          nextAgent: "Bug Fixer",
        };
        break;
      case "Bug Fixer":
        parsed = {
          implementationSummary: "Applied a minimal bug-fix mock change to prove end-to-end execution.",
          filesChanged: ["mock-change.txt"],
          changesMade: ["Wrote a marker file with bug-fix summary."],
          unitTestsAdded: ["mock-change.test.txt"],
          testsToRun: ["npm run --if-present check", "npm run --if-present test"],
          risks: ["Mock provider does not reason over real code semantics."],
          edits: [
            {
              path: "mock-change.txt",
              action: "replace",
              content: `mock bug fix generated at ${new Date().toISOString()}\n`,
            },
            {
              path: "mock-change.test.txt",
              action: "replace",
              content: `mock unit test placeholder generated at ${new Date().toISOString()}\n`,
            },
          ],
          nextAgent: "Reviewer",
        };
        break;
      case "Feature Builder":
        parsed = {
          implementationSummary: "Applied a minimal mock change to prove end-to-end execution.",
          filesChanged: ["mock-change.txt"],
          changesMade: ["Wrote a marker file with task summary."],
          unitTestsAdded: ["mock-change.test.txt"],
          testsToRun: ["npm run --if-present check", "npm run --if-present test"],
          risks: ["Mock provider does not reason over real code semantics."],
          edits: [
            {
              path: "mock-change.txt",
              action: "replace",
              content: `mock change generated at ${new Date().toISOString()}\n`,
            },
            {
              path: "mock-change.test.txt",
              action: "replace",
              content: `mock unit test placeholder generated at ${new Date().toISOString()}\n`,
            },
          ],
          nextAgent: "Reviewer",
        };
        break;
      case "Reviewer":
        parsed = {
          whatLooksGood: ["Change is minimal and scoped."],
          issuesFound: [],
          requiredChanges: [],
          verdict: "approved",
          nextAgent: "QA Validator",
        };
        break;
      case "QA Validator":
        parsed = {
          mainScenarios: ["Verify changed file is present and readable."],
          acceptanceChecklist: ["Change exists in git diff."],
          failures: [],
          verdict: "pass",
          e2ePlan: ["Run main user flow end-to-end if project has an e2e script."],
          changedFiles: ["mock-change.txt"],
          executedChecks: [],
          nextAgent: "PR Writer",
        };
        break;
      case "PR Writer":
        parsed = {
          summary: "Mock run completed with a minimal file edit.",
          whatWasDone: ["Generated mock-change.txt to validate pipeline wiring."],
          testPlan: ["Inspect git diff.", "Review file content."],
          rolloutNotes: ["No production rollout required for mock provider output."],
          nextAgent: "Human Review",
        };
        break;
      default:
        parsed = {};
        break;
    }

    return {
      rawText: JSON.stringify(parsed),
      parsed,
      provider: "mock",
      model: this.model,
      parseRetries: 0,
      validationPassed: true,
      providerAttempts: 1,
      providerBackoffRetries: 0,
      providerBackoffWaitMs: 0,
      providerRateLimitWaitMs: 0,
      estimatedInputTokens: 0,
      estimatedOutputTokens: 0,
      estimatedTotalTokens: 0,
      estimatedCostUsd: 0,
    };
  }
}
