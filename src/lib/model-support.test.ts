import { describe, expect, it } from "vitest";
import { modelsLikelyMatch, findDiscoveredModelMatch, choosePreferredDiscoveredModel } from "./model-support.js";

describe("lib/model-support", () => {
  describe("modelsLikelyMatch", () => {
    it("returns true for exact matches", () => {
      expect(modelsLikelyMatch("gpt-4o", "gpt-4o")).toBe(true);
      expect(modelsLikelyMatch("GPT-4O", "gpt-4o")).toBe(true);
    });

    it("strips colon tags and matches", () => {
      expect(modelsLikelyMatch("gpt-4o:latest", "gpt-4o")).toBe(true);
      expect(modelsLikelyMatch("gpt-4o", "gpt-4o:1234")).toBe(true);
    });

    it("matches by leaf name if one has no namespace", () => {
      expect(modelsLikelyMatch("llama-3", "meta/llama-3")).toBe(true);
      expect(modelsLikelyMatch("openai/gpt-4", "gpt-4")).toBe(true);
    });

    it("returns false if both have different namespaces", () => {
      expect(modelsLikelyMatch("provider1/m1", "provider2/m1")).toBe(false);
    });

    it("returns false if leaf names differ", () => {
      expect(modelsLikelyMatch("gpt-4", "gpt-3.5")).toBe(false);
    });

    it("handles empty or invalid inputs", () => {
      expect(modelsLikelyMatch("", "gpt-4")).toBe(false);
      expect(modelsLikelyMatch("gpt-4", "")).toBe(false);
    });
  });

  describe("findDiscoveredModelMatch", () => {
    const models = ["gpt-4o", "meta/llama-3:latest", "anthropic/claude-3-sonnet"];

    it("finds exact match", () => {
      const match = findDiscoveredModelMatch("gpt-4o", models);
      expect(match).toEqual({ matchedModel: "gpt-4o", exact: true });
    });

    it("finds loose match", () => {
      const match = findDiscoveredModelMatch("llama-3", models);
      expect(match).toEqual({ matchedModel: "meta/llama-3:latest", exact: false });
    });

    it("returns null if no match", () => {
      expect(findDiscoveredModelMatch("gpt-3.5", models)).toBeNull();
    });

    it("handles empty models list", () => {
      expect(findDiscoveredModelMatch("gpt-4o", [])).toBeNull();
    });
  });

  describe("choosePreferredDiscoveredModel", () => {
    const models = ["gpt-4o", "llama-3"];

    it("returns preferred model if matched", () => {
      expect(choosePreferredDiscoveredModel(models, "gpt-4o")).toBe("gpt-4o");
      expect(choosePreferredDiscoveredModel(models, "llama-3:latest")).toBe("llama-3");
    });

    it("returns first available if preferred not matched", () => {
      expect(choosePreferredDiscoveredModel(models, "claude")).toBe("gpt-4o");
    });

    it("returns trimmed preferred if models list is empty", () => {
      expect(choosePreferredDiscoveredModel([], " gpt-4o ")).toBe("gpt-4o");
    });
  });
});
