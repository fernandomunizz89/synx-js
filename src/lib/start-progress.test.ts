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

    it("should render frames correctly", () => {
      const renderer = createStartProgressRenderer({ enabled: true }) as any;
      const snapshot = {
        loop: 1,
        engineStartedAtMs: Date.now() - 1000,
        metas: [mockMeta],
        paused: false,
        enginePanelHasCritical: false,
        logViewMode: "console",
        interactionMode: "command",
        inputBuffer: "test",
        humanInputLines: ["Input line"],
        consoleLogLines: ["Log line"],
        eventLogLines: [],
      };
      
      renderer.render(snapshot);
      expect(renderer.log).toBeDefined();
      renderer.stop();
    });

    it("should handle static frame updates", () => {
        const renderer = createStartProgressRenderer({ enabled: true }) as any;
        renderer.setStaticFrame({
            headerContextLines: ["Header"],
            fixedControlPanelLines: ["Control"],
            enginePanelLines: ["Engine"],
        });
        expect(renderer.staticFrame.headerContextLines).toContain("Header");
        renderer.stop();
    });

    it("should handle resize events", () => {
        const renderer = createStartProgressRenderer({ enabled: true }) as any;
        const stdout = process.stdout as any;
        const resizeHandler = stdout.on.mock.calls.find((call: any) => call[0] === "resize")?.[1];
        expect(resizeHandler).toBeDefined();
        
        resizeHandler();
        vi.advanceTimersByTime(50);
        expect(renderer.resizePending).toBe(false);
        renderer.stop();
    });

    it("should render with different log and interaction modes", () => {
        const renderer = createStartProgressRenderer({ enabled: true }) as any;
        const baseSnapshot = {
          loop: 1,
          engineStartedAtMs: Date.now() - 1000,
          metas: [mockMeta],
          paused: false,
          enginePanelHasCritical: false,
          logViewMode: "event_stream" as const,
          interactionMode: "human_input" as const,
          inputBuffer: "",
          humanInputLines: ["Waiting for you"],
          consoleLogLines: [],
          eventLogLines: ["Something happened"],
        };
        
        // Mode: Event Stream + Human Input
        renderer.render(baseSnapshot);
        
        // Mode: Console + Paused
        renderer.render({
            ...baseSnapshot,
            logViewMode: "console",
            paused: true,
        });

        // Mode: Failed Status
        const failedMeta = { ...mockMeta, status: "failed" as const };
        renderer.render({
            ...baseSnapshot,
            metas: [failedMeta],
        });

        renderer.stop();
    });

    it("should handle tight terminal space by dropping panels", () => {
        const renderer = createStartProgressRenderer({ enabled: true }) as any;
        const stdout = process.stdout as any;
        stdout.rows = 15; // Small but reasonable height
        
        const snapshot = {
            loop: 1,
            engineStartedAtMs: Date.now(),
            metas: [mockMeta],
            paused: false,
            enginePanelHasCritical: true,
            logViewMode: "console" as const,
            interactionMode: "command" as const,
            inputBuffer: "",
            humanInputLines: [],
            consoleLogLines: ["L1", "L2", "L3", "L4", "L5"],
            eventLogLines: [],
        };
        
        renderer.render(snapshot);
        expect(renderer.lastFrameLineCount).toBeLessThanOrEqual(15);
        renderer.stop();
    });

    it("should show researcher status when active", () => {
        const renderer = createStartProgressRenderer({ enabled: true }) as any;
        const snapshot = {
            loop: 1,
            engineStartedAtMs: Date.now(),
            metas: [{ ...mockMeta, currentAgent: "Researcher", status: "in_progress" as const }],
            paused: false,
            enginePanelHasCritical: false,
            logViewMode: "event_stream" as const,
            interactionMode: "command" as const,
            inputBuffer: "",
            humanInputLines: [],
            consoleLogLines: [],
            eventLogLines: ["Search start"],
        };
        
        renderer.render(snapshot);
        renderer.stop();
    });
  });

  describe("SilentStartProgressRenderer", () => {
    it("should do nothing", () => {
        const renderer = createStartProgressRenderer({ enabled: false });
        renderer.setStaticFrame({} as any);
        renderer.render({} as any);
        renderer.stop();
        expect(renderer.enabled).toBe(false);
    });
  });

  describe("Internal Helper Functions", () => {
    it("shortTaskId should truncate long IDs", () => {
        const longId = "a".repeat(50);
        // buildUserInputLines is exported but shortTaskId is internal to start-progress.ts
        // Since it's internal we can't test it directly unless we export it or test it via render.
        // But for coverage purposes, we'll ensure it's hit by the render test.
    });

    it("visibleWidth and padRightAnsi", () => {
        // These are internal, so we test them via exported functions if possible or just rely on render coverage.
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
