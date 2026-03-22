import { describe, expect, it } from "vitest";
import { providerErrorToHuman, providerHealthToHuman } from "./human-messages.js";

describe("lib/human-messages", () => {
  describe("providerErrorToHuman", () => {
    it("maps JSON extraction errors", () => {
      expect(providerErrorToHuman("could not extract JSON from result")).toContain("could not understand");
    });

    it("maps missing base URL errors", () => {
      expect(providerErrorToHuman("missing base URL env")).toContain("Run setup");
      expect(providerErrorToHuman("Missing provider base URL")).toContain("Run setup");
    });

    it("maps quota/429 errors", () => {
      expect(providerErrorToHuman("failed with 429")).toContain("quota or billing");
    });

    it("maps connection refused errors", () => {
      expect(providerErrorToHuman("fetch failed")).toContain("could not be reached");
      expect(providerErrorToHuman("ECONNREFUSED")).toContain("could not be reached");
    });

    it("returns original message if no match", () => {
      expect(providerErrorToHuman("Unexpected error")).toBe("Unexpected error");
    });
  });

  describe("providerHealthToHuman", () => {
    it("maps auth errors (401/403)", () => {
      expect(providerHealthToHuman("provider answered with 401")).toContain("rejected authentication");
    });

    it("maps 404 errors", () => {
      expect(providerHealthToHuman("provider answered with 404")).toContain("confirm base URL ends with /v1");
    });

    it("maps no models errors", () => {
      expect(providerHealthToHuman("returned no models")).toContain("load at least one model");
    });

    it("maps connection refused errors", () => {
      expect(providerHealthToHuman("fetch failed")).toContain("start LM Studio server");
    });
  });
});
