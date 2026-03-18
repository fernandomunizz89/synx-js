import { describe, it, expect } from "vitest";
import { buildAgentRoleContract } from "./agent-role-contract.js";

describe("agent-role-contract", () => {
  it("should include high-performance engineering team model", () => {
    const contract = buildAgentRoleContract("Dispatcher", { stage: "triage" });
    expect(contract).toContain("TEAM OPERATING MODEL (High-Performance Engineering Team):");
    expect(contract).toContain("- Act with Ownership");
    expect(contract).toContain("- Evidence-Driven Decisiveness");
  });

  it("should include specific role mission for Synx QA Engineer", () => {
    const contract = buildAgentRoleContract("Synx QA Engineer", { stage: "qa" });
    expect(contract).toContain("ROLE: High-Voltage Execution Arbiter");
    expect(contract).toContain("- Mission: break the software implemented by domain experts");
  });
});
