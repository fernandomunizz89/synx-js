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
          nextAgent: "Synx Front Expert",
        };
        break;
      }
      case "Synx Front Expert":
      case "Synx Mobile Expert":
      case "Synx Back Expert":
      case "Synx SEO Specialist":
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
          nextAgent: "Synx QA Engineer",
        };
        break;
      case "Synx QA Engineer":
        parsed = {
          mainScenarios: ["Verify changed file is present and readable."],
          acceptanceChecklist: ["Change exists in git diff."],
          failures: [],
          verdict: "pass",
          e2ePlan: ["Run main user flow end-to-end if project has an e2e script."],
          changedFiles: ["mock-change.txt"],
          executedChecks: [],
          nextAgent: "Human Review",
        };
        break;
      case "Human Review":
        parsed = {
          accepted: true,
          feedback: "Looks good.",
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
