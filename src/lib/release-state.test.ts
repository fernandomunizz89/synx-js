import { describe, expect, it, vi, beforeEach } from "vitest";
import { 
  loadReleaseState, 
  saveReleaseState, 
  activateStabilizationMode, 
  recordReleaseIncident, 
  updateStabilizationFocus 
} from "./release-state.js";
import { ensureDir, exists, readJson, writeJson } from "./fs.js";
import { runtimeDir } from "./paths.js";
import { nowIso } from "./utils.js";

vi.mock("./fs.js", () => ({
  ensureDir: vi.fn(),
  exists: vi.fn(),
  readJson: vi.fn(),
  writeJson: vi.fn(),
}));

vi.mock("./paths.js", () => ({
  runtimeDir: vi.fn(() => "/tmp/synx-runtime"),
}));

vi.mock("./utils.js", () => ({
  nowIso: vi.fn(() => "2024-01-01T00:00:00.000Z"),
}));

describe("lib/release-state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("loadReleaseState", () => {
    it("returns default state if file does not exist", async () => {
      vi.mocked(exists).mockResolvedValue(false);
      const state = await loadReleaseState();
      expect(state.version).toBe(1);
      expect(state.stabilization.active).toBe(false);
      expect(state.history).toEqual([]);
    });

    it("returns parsed state if version and stabilization match", async () => {
      vi.mocked(exists).mockResolvedValue(true);
      const mockState = { version: 1, stabilization: { active: true }, history: [] };
      vi.mocked(readJson).mockResolvedValue(mockState);
      
      const state = await loadReleaseState();
      expect(state).toEqual(mockState);
    });

    it("returns default state on parse error", async () => {
      vi.mocked(exists).mockResolvedValue(true);
      vi.mocked(readJson).mockRejectedValue(new Error("Corrupt"));
      
      const state = await loadReleaseState();
      expect(state.version).toBe(1);
      expect(state.stabilization.active).toBe(false);
    });
  });

  describe("saveReleaseState", () => {
    it("ensures runtime dir and writes json", async () => {
      const state = { version: 1 } as any;
      await saveReleaseState(state);
      expect(ensureDir).toHaveBeenCalledWith("/tmp/synx-runtime");
      expect(writeJson).toHaveBeenCalledWith("/tmp/synx-runtime/release-state.json", state);
    });
  });

  describe("activateStabilizationMode", () => {
    it("sets stabilization to active and adds history event", async () => {
      vi.mocked(exists).mockResolvedValue(false);
      const res = await activateStabilizationMode({
        taskId: "t1",
        summary: "Stabilizing",
        focusAreas: ["UI", "  API  ", ""],
        windowHours: 48
      });

      expect(res.stabilization.active).toBe(true);
      expect(res.stabilization.releaseTaskId).toBe("t1");
      expect(res.stabilization.summary).toBe("Stabilizing");
      expect(res.stabilization.focusAreas).toEqual(["UI", "API"]);
      expect(res.history).toHaveLength(1);
      expect(res.history[0].event).toBe("stabilization_started");
      expect(writeJson).toHaveBeenCalled();
    });
  });

  describe("recordReleaseIncident", () => {
    it("increments incidents and adds focus areas", async () => {
      vi.mocked(exists).mockResolvedValue(false);
      const res = await recordReleaseIncident({
        taskId: "t2",
        summary: "Bug found",
        severity: "critical",
        focusAreas: ["DB"]
      });

      expect(res.stabilization.incidents).toBe(1);
      expect(res.stabilization.focusAreas).toContain("DB");
      expect(res.history[0].event).toBe("incident_recorded");
      expect(res.history[0].severity).toBe("critical");
    });
  });

  describe("updateStabilizationFocus", () => {
    it("updates focus areas and summary", async () => {
      vi.mocked(exists).mockResolvedValue(false);
      const res = await updateStabilizationFocus({
        taskId: "t3",
        summary: "New summary",
        focusAreas: ["Security"]
      });

      expect(res.stabilization.summary).toBe("New summary");
      expect(res.stabilization.focusAreas).toEqual(["Security"]);
      expect(res.history[0].event).toBe("stabilization_updated");
    });
  });
});
