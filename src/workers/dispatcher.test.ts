import { describe, it, expect, vi, beforeEach } from "vitest";
import { DispatcherWorker } from "./dispatcher.js";
import * as fsLib from "../lib/fs.js";
import * as configLib from "../lib/config.js";
import * as projectHandoffLib from "../lib/project-handoff.js";
import * as projectMemoryLib from "../lib/project-memory.js";
import * as taskArtifactsLib from "../lib/task-artifacts.js";
import * as capabilityRoutingLib from "../lib/capability-routing.js";
import * as providerFactoryLib from "../providers/factory.js";
import * as taskLib from "../lib/task.js";

vi.mock("../lib/fs.js");
vi.mock("../lib/config.js");
vi.mock("../lib/paths.js", () => ({
  taskDir: (id: string) => `/tmp/tasks/${id}`,
}));
vi.mock("../lib/project-handoff.js");
vi.mock("../lib/project-memory.js");
vi.mock("../lib/task-artifacts.js");
vi.mock("../lib/capability-routing.js");
vi.mock("../providers/factory.js");
vi.mock("../lib/task.js");
vi.mock("../lib/agent-role-contract.js", () => ({
  buildAgentRoleContract: () => "mock-contract",
}));
vi.mock("../lib/logging.js", () => ({
  logDaemon: vi.fn(),
  logTaskEvent: vi.fn(),
  logRuntimeEvent: vi.fn(),
  logQueueLatency: vi.fn(),
  logAgentAudit: vi.fn(),
  logTiming: vi.fn(),
}));

describe("DispatcherWorker", () => {
  let worker: DispatcherWorker;
  const taskId = "task-123";

  beforeEach(() => {
    vi.clearAllMocks();
    worker = new DispatcherWorker();
    vi.mocked(configLib.loadResolvedProjectConfig).mockResolvedValue({} as any);
    vi.mocked(configLib.loadPromptFile).mockResolvedValue("Dispatcher prompt {{INPUT_JSON}}");
    vi.mocked(fsLib.readJson).mockResolvedValue({ title: "New Task", typeHint: "Feature" });
    vi.mocked(projectHandoffLib.collectProjectProfile).mockResolvedValue({} as any);
    vi.mocked(projectHandoffLib.projectProfileFactLines).mockReturnValue([]);
    vi.mocked(projectMemoryLib.loadProjectMemory).mockResolvedValue(null);
    vi.mocked(projectMemoryLib.projectMemoryFactLines).mockReturnValue([]);
    vi.mocked(capabilityRoutingLib.routeByCapabilities).mockResolvedValue({
      selected: { agentName: "BackExpert", stage: "back-stage", requestFileName: "back.json", source: "built-in" } as any,
      candidates: [
        {
          agentName: "BackExpert",
          score: { total: 0.9, capabilityMatch: 0.9, projectStackMatch: 0.8, taskTypeMatch: 1.0, approvalRate: 0.9, capabilityApprovalRate: 0.9, recentFailurePattern: 0.0 },
        } as any,
      ],
    });
    
    // Mock provider
    const mockProvider = {
      generateStructured: vi.fn().mockResolvedValue({
        parsed: {
          type: "Feature",
          goal: "Implement X",
          context: "User wants X",
          knownFacts: [],
          unknowns: [],
          assumptions: [],
          constraints: [],
          confidenceScore: 0.9,
          requiresHumanInput: false,
          nextAgent: "BackExpert",
          suggestedChain: ["BackExpert"],
        },
        provider: "mock",
        model: "m",
        parseRetries: 0,
        validationPassed: true,
      }),
    };
    vi.mocked(providerFactoryLib.createProvider).mockReturnValue(mockProvider as any);
    vi.mocked(taskLib.loadTaskMeta).mockResolvedValue({ history: [] } as any);
  });

  it("processes a task and routes to the next agent", async () => {
    // We need to call processTask, which is protected.
    // In DispatcherWorker, processTask is public or we can use a test subclass.
    // Actually in dispatcher.ts it is protected.
    
    // Let's use as any to call it for simplicity in test
    await (worker as any).processTask(taskId, { stage: "dispatcher" });

    expect(providerFactoryLib.createProvider).toHaveBeenCalled();
    expect(taskArtifactsLib.saveTaskArtifact).toHaveBeenCalledWith(taskId, "project-profile.json", expect.anything());
    expect(capabilityRoutingLib.routeByCapabilities).toHaveBeenCalled();
    expect(taskLib.saveTaskMeta).toHaveBeenCalled(); // for suggestedChain
  });

  it("handles dispatcher output with missing suggestedChain", async () => {
    const mockProvider = providerFactoryLib.createProvider({} as any);
    vi.mocked(mockProvider.generateStructured).mockResolvedValueOnce({
      parsed: {
        type: "Feature",
        goal: "X",
        context: "Y",
        knownFacts: [],
        unknowns: [],
        assumptions: [],
        constraints: [],
        nextAgent: "BackExpert",
        requiresHumanInput: false,
      },
      provider: "mock",
      model: "m",
    } as any);

    await (worker as any).processTask(taskId, { stage: "dispatcher" });
    // Should still finish without crashing
    expect(capabilityRoutingLib.routeByCapabilities).toHaveBeenCalled();
  });
});
