import { describe, expect, it, vi, beforeEach } from "vitest";
import { learnCommand } from "./learn.js";
import * as bootstrap from "../lib/bootstrap.js";
import * as learnings from "../lib/learnings.js";

vi.mock("../lib/bootstrap.js", () => ({
  ensureGlobalInitialized: vi.fn(),
  ensureProjectInitialized: vi.fn(),
}));

vi.mock("../lib/learnings.js", () => ({
  listAgentsWithLearnings: vi.fn(),
  loadAllLearnings: vi.fn(),
  computeLearningStats: vi.fn(),
}));

describe("commands/learn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("reports no data if no agents have learnings", async () => {
    vi.mocked(learnings.listAgentsWithLearnings).mockResolvedValue([]);

    await learnCommand.parseAsync(["node", "learn"]);

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("No learning data found."));
  });

  it("lists learnings for all agents if no agent-id provided", async () => {
    vi.mocked(learnings.listAgentsWithLearnings).mockResolvedValue(["agent1"]);
    vi.mocked(learnings.loadAllLearnings).mockResolvedValue([
        { taskId: "t1", timestamp: "2024-01-01", outcome: "approved", summary: "Win" }
    ] as any);
    vi.mocked(learnings.computeLearningStats).mockReturnValue({
        agentId: "agent1", total: 1, approved: 1, reproved: 0, approvalRate: 100, lastTimestamp: "2024-01-01", mostRecentOutcome: "approved"
    });

    await learnCommand.parseAsync(["node", "learn"]);

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Agent: agent1"));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Total runs : 1"));
  });

  it("lists learnings for a specific agent if agent-id provided", async () => {
    vi.mocked(learnings.loadAllLearnings).mockResolvedValue([
        { taskId: "t1", timestamp: "2024-01-01", outcome: "reproved", summary: "Fail", reproveReason: "Too slow" }
    ] as any);
    vi.mocked(learnings.computeLearningStats).mockReturnValue({
        agentId: "agent1", total: 1, approved: 0, reproved: 1, approvalRate: 0, lastTimestamp: "2024-01-01", mostRecentOutcome: "reproved"
    });

    await learnCommand.parseAsync(["node", "learn", "agent1"]);

    expect(learnings.listAgentsWithLearnings).not.toHaveBeenCalled();
    expect(learnings.loadAllLearnings).toHaveBeenCalledWith("agent1");
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Feedback: Too slow"));
  });

  it("limits the number of entries shown", async () => {
    vi.mocked(learnings.loadAllLearnings).mockResolvedValue([
        { taskId: "t1", timestamp: "1", outcome: "approved", summary: "S1" },
        { taskId: "t2", timestamp: "2", outcome: "approved", summary: "S2" },
        { taskId: "t3", timestamp: "3", outcome: "approved", summary: "S3" }
    ] as any);
    vi.mocked(learnings.computeLearningStats).mockReturnValue({
        agentId: "agent1", total: 3, approved: 3, reproved: 0, approvalRate: 100, lastTimestamp: "3", mostRecentOutcome: "approved"
    });

    await learnCommand.parseAsync(["node", "learn", "agent1", "--limit", "1"]);

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Last 1 entries:"));
    expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining("S1"));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("S3"));
  });
});
