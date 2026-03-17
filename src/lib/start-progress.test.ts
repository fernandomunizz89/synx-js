import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { 
  createStartProgressRenderer, 
  formatDuration, 
  stageRoute, 
  stageLabel, 
  progressForMeta, 
  progressBar,
  buildUserInputLines
} from "./start-progress.js";
import type { TaskMeta } from "./types.js";

describe("start-progress", () => {
  const mockMeta: TaskMeta = {
    taskId: "task-1",
    title: "Test Task",
    type: "Feature",
    project: "test-project",
    status: "in_progress",
    currentStage: "builder",
    currentAgent: "Feature Builder",
    nextAgent: "Reviewer",
    humanApprovalRequired: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    history: [
      {
        stage: "dispatcher",
        agent: "Dispatcher",
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        durationMs: 100,
        status: "done",
      },
    ],
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("process", {
      stdout: {
        isTTY: true,
        columns: 80,
        rows: 24,
        on: vi.fn(),
        off: vi.fn(),
        write: vi.fn(),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("TtyStartProgressRenderer", () => {
    it("should create a TTY renderer when enabled and in TTY", () => {
      const renderer = createStartProgressRenderer({ enabled: true });
      expect(renderer.enabled).toBe(true);
      renderer.stop();
    });

    it("should create a silent renderer when disabled", () => {
      const renderer = createStartProgressRenderer({ enabled: false });
      expect(renderer.enabled).toBe(false);
    });

    it("should create a silent renderer when not in TTY", () => {
      vi.stubGlobal("process", { stdout: { isTTY: false } });
      const renderer = createStartProgressRenderer({ enabled: true });
      expect(renderer.enabled).toBe(false);
    });
  });

  describe("formatDuration", () => {
    it("should format ms to MM:SS", () => {
      expect(formatDuration(0)).toBe("00:00");
      expect(formatDuration(1000)).toBe("00:01");
      expect(formatDuration(61000)).toBe("01:01");
      expect(formatDuration(3599000)).toBe("59:59");
    });
  });

  describe("stageRoute", () => {
    it("should return bug route for Bug type", () => {
      const meta: TaskMeta = { ...mockMeta, type: "Bug", history: [] };
      expect(stageRoute(meta)).toContain("bug-investigator");
    });

    it("should return bug route if history has bug-investigator", () => {
      const meta: TaskMeta = { 
        ...mockMeta, 
        type: "Feature", 
        history: [{ stage: "bug-investigator" } as any] 
      };
      expect(stageRoute(meta)).toContain("bug-fixer");
    });

    it("should return planner route for Feature type", () => {
      const meta: TaskMeta = { ...mockMeta, type: "Feature", history: [] };
      expect(stageRoute(meta)).toContain("planner");
    });
    
    it("should return bug route if history has bug-fixer", () => {
      const meta: TaskMeta = { 
        ...mockMeta, 
        type: "Feature", 
        history: [{ stage: "bug-fixer" } as any] 
      };
      expect(stageRoute(meta)).toContain("bug-investigator");
    });

    it("should return planner route if history has planner", () => {
      const meta: TaskMeta = { 
        ...mockMeta, 
        type: "Bug", 
        history: [{ stage: "planner" } as any] 
      };
      expect(stageRoute(meta)).toContain("builder");
    });
  });

  describe("stageLabel", () => {
    it("should return correct labels", () => {
      expect(stageLabel("dispatcher")).toBe("Dispatcher");
      expect(stageLabel("planner:research")).toBe("Researcher");
      expect(stageLabel("builder")).toBe("Feature Builder");
      expect(stageLabel("unknown")).toBe("unknown");
      expect(stageLabel("")).toBe("[none]");
    });
  });

  describe("progressForMeta", () => {
    it("should calculate progress correctly", () => {
      const meta: TaskMeta = { ...mockMeta, status: "done", history: [] };
      const progress = progressForMeta(meta);
      expect(progress.ratio).toBe(1);
      
      const inProgressMeta: TaskMeta = { ...mockMeta, status: "in_progress", history: [] };
      expect(progressForMeta(inProgressMeta).ratio).toBeGreaterThan(0);
      
      const failedMeta: TaskMeta = { ...mockMeta, status: "failed", history: [] };
      expect(progressForMeta(failedMeta).ratio).toBeGreaterThan(0);
    });
  });

  describe("progressBar", () => {
      it("should render bar", () => {
          expect(progressBar(0)).toContain("·");
          expect(progressBar(1)).toContain("█");
          expect(progressBar(0.5)).toContain("█");
          expect(progressBar(0.5)).toContain("·");
      });
  });

  describe("buildUserInputLines", () => {
    it("should render placeholder if buffer is empty", () => {
      const lines = buildUserInputLines({
        width: 80,
        promptIndicator: ">",
        promptCursor: "|",
        inputBuffer: "",
        placeholder: "type here",
      });
      expect(lines[0]).toContain("type here");
    });

    it("should render input buffer", () => {
        const lines = buildUserInputLines({
          width: 80,
          promptIndicator: ">",
          promptCursor: "|",
          inputBuffer: "hello synx",
          placeholder: "type here",
        });
        expect(lines[0]).toContain("hello synx");
      });
      
      it("should wrap long input", () => {
        const lines = buildUserInputLines({
          width: 20,
          promptIndicator: ">",
          promptCursor: "|",
          inputBuffer: "a very long input string that should wrap across multiple lines in the display",
          placeholder: "type here",
        });
        expect(lines.length).toBeGreaterThan(1);
      });
  });
});
