import { describe, it, expect } from "vitest";
import { buildAgentRoleContract } from "./agent-role-contract.js";

describe("agent-role-contract", () => {
  it("should include high-performance engineering team model", () => {
    const contract = buildAgentRoleContract("Dispatcher", { stage: "triage" });
    expect(contract).toContain("TEAM OPERATING MODEL (High-Performance Engineering Team):");
    expect(contract).toContain("- Act with Ownership");
    expect(contract).toContain("- Evidence-Driven Decisiveness");
  });

  it("should include assertive collaboration requirements", () => {
    const contract = buildAgentRoleContract("Spec Planner", { stage: "planning" });
    expect(contract).toContain("COLLABORATION REQUIREMENTS:");
    expect(contract).toContain("- Step-by-Step Reasoning: always output your inner thought process before committing to JSON results.");
    expect(contract).toContain("- Assertive Action: prefer deterministic, directly verifiable actions over vague recommendations.");
  });

  it("should include specific role mission for Dispatcher", () => {
    const contract = buildAgentRoleContract("Dispatcher", { stage: "triage" });
    expect(contract).toContain("ROLE: Technical Triage & Architecture Gatekeeper");
    expect(contract).toContain("- Direct the mission");
  });

  it("should include specific role mission for Spec Planner", () => {
    const contract = buildAgentRoleContract("Spec Planner", { stage: "planning" });
    expect(contract).toContain("ROLE: Architecture Architect / Staff Engineer");
    expect(contract).toContain("- Blueprint the Solution");
  });
});
