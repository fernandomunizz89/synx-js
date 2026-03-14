import type { ProviderRequest, ProviderResult } from "../lib/types.js";
import type { LlmProvider } from "./provider.js";
import { sleep } from "../lib/utils.js";

export class MockProvider implements LlmProvider {
  constructor(private readonly model: string) {}

  async generateStructured(request: ProviderRequest): Promise<ProviderResult> {
    await sleep(250);

    let parsed: unknown;
    if (request.agent === "Dispatcher") {
      const input = request.input as any;
      const normalizedType = (input.typeHint || "Feature") as string;

      parsed = {
        type: normalizedType,
        goal: input.rawRequest || input.title || "Untitled task",
        context: `Project: ${input.project || "[not set]"}`,
        knownFacts: [`The user requested: ${input.rawRequest || input.title || "Untitled task"}`],
        unknowns: ["Project-specific implementation details are unknown from the current input."],
        assumptions: [],
        constraints: ["Do not change unrelated code paths."],
        requiresHumanInput: false,
        nextAgent: normalizedType === "Bug" ? "Bug Investigator" : "Spec Planner",
      };
    } else {
      parsed = {
        technicalContext: "Current technical context is still unknown from the available input.",
        knownFacts: ["The task was classified earlier in the pipeline."],
        unknowns: ["Exact files, components, data flow, and constraints are not yet confirmed."],
        assumptions: [],
        requiresHumanInput: false,
        conditionalPlan: [
          "Locate the current implementation related to the task goal.",
          "Confirm which files and flows are involved before proposing changes.",
          "Plan only the smallest change supported by confirmed context.",
        ],
        edgeCases: ["Missing implementation area", "Ambiguous scope in current request"],
        risks: ["Planning beyond confirmed facts"],
        validationCriteria: ["Plan stays within confirmed context only"],
        nextAgent: "Feature Builder",
      };
    }

    return {
      rawText: JSON.stringify(parsed),
      parsed,
      provider: "mock",
      model: this.model,
      parseRetries: 0,
      validationPassed: true,
    };
  }
}
