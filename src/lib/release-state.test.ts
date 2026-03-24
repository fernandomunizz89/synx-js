import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  activateStabilizationMode,
  loadReleaseState,
  recordReleaseIncident,
  updateStabilizationFocus,
} from "./release-state.js";

const originalCwd = process.cwd();

describe.sequential("lib/release-state", () => {
  let root = "";

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-release-state-test-"));
    await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ name: "release-state-test" }, null, 2), "utf8");
    process.chdir(root);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  it("activates stabilization mode and persists release metadata", async () => {
    await activateStabilizationMode({
      taskId: "task-1",
      summary: "Release candidate accepted",
      focusAreas: ["src/app.ts"],
      windowHours: 12,
    });

    const state = await loadReleaseState();
    expect(state.stabilization.active).toBe(true);
    expect(state.stabilization.releaseTaskId).toBe("task-1");
    expect(state.stabilization.focusAreas).toContain("src/app.ts");
    expect(state.history.some((event) => event.event === "stabilization_started")).toBe(true);
  });

  it("records incidents and updates stabilization focus", async () => {
    await activateStabilizationMode({
      taskId: "task-2",
      summary: "Stabilization started",
    });
    await recordReleaseIncident({
      taskId: "task-2",
      summary: "Smoke check failed in production-like env",
      severity: "high",
      focusAreas: ["npm run build"],
    });
    await updateStabilizationFocus({
      taskId: "task-2",
      summary: "Updated from customer feedback synthesis",
      focusAreas: ["src/api/orders.ts", "npm run build"],
    });

    const state = await loadReleaseState();
    expect(state.stabilization.incidents).toBeGreaterThanOrEqual(1);
    expect(state.stabilization.focusAreas).toContain("src/api/orders.ts");
    expect(state.history.some((event) => event.event === "incident_recorded")).toBe(true);
    expect(state.history.some((event) => event.event === "stabilization_updated")).toBe(true);
  });
});
