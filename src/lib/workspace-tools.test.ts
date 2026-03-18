import { describe, it, expect } from "vitest";
import * as workspaceTools from "./workspace-tools.js";

describe("workspace-tools", () => {
  it("should export workspace scanner functions", () => {
    expect(workspaceTools.buildWorkspaceContextSnapshot).toBeDefined();
    expect(workspaceTools.walkFiles).toBeDefined();
  });

  it("should export workspace editor functions", () => {
    expect(workspaceTools.applyWorkspaceEdits).toBeDefined();
  });

  it("should export command runner functions", () => {
    expect(workspaceTools.runCommand).toBeDefined();
  });

  it("should export validation check functions", () => {
    expect(workspaceTools.detectTestCapabilities).toBeDefined();
    expect(workspaceTools.runProjectChecks).toBeDefined();
  });

  it("should export e2e selector tools", () => {
    expect(workspaceTools.runE2ESelectorPreflight).toBeDefined();
  });
});
