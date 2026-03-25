import { describe, expect, it, vi, beforeEach } from "vitest";
import { normalizeAgentSlug, summarizeOutput, logAgentAudit } from "./agent-audit.js";
import { appendText } from "../fs.js";
import { logsDir } from "../paths.js";
import path from "node:path";

vi.mock("../fs.js", () => ({
  appendText: vi.fn(),
}));

vi.mock("../paths.js", () => ({
  logsDir: vi.fn(() => "/tmp/synx-logs"),
}));

vi.mock("../utils.js", () => ({
  nowIso: vi.fn(() => "2024-01-01T00:00:00.000Z"),
}));

describe("lib/logging/agent-audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("normalizeAgentSlug", () => {
    it("converts agent names to slugs", () => {
      expect(normalizeAgentSlug("QA Engineer")).toBe("qa-engineer");
      expect(normalizeAgentSlug("Research_Agent!")).toBe("research-agent");
    });
  });

  describe("summarizeOutput", () => {
    it("returns empty object for non-objects", () => {
      expect(summarizeOutput(null)).toEqual({});
      expect(summarizeOutput("string")).toEqual({});
      expect(summarizeOutput([])).toEqual({});
    });

    it("extracts scalar fields", () => {
      const output = { summary: "Done", verdict: "yes", implementationSummary: "fixed" };
      const res = summarizeOutput(output);
      expect(res.summary).toBe("Done");
      expect(res.verdict).toBe("yes");
      expect(res.implementationSummary).toBe("fixed");
    });

    it("extracts and truncates list fields", () => {
      const output = { filesChanged: ["a.ts", "b.ts", "c.ts", "d.ts"] };
      const res = summarizeOutput(output);
      expect(res.filesChangedCount).toBe(4);
      expect(res.filesChanged).toHaveLength(3);
    });

    it("extracts numeric fields", () => {
      const output = { attempt: 1, estimatedCostUsd: 0.05, invalid: "NaN" };
      const res = summarizeOutput(output);
      expect(res.attempt).toBe(1);
      expect(res.estimatedCostUsd).toBe(0.05);
      expect(res.invalid).toBeUndefined();
    });

    it("extracts metrics object", () => {
      const output = { metrics: { plannedChecks: 10, executedChecks: 5 } };
      const res = summarizeOutput(output);
      expect((res.metrics as any).plannedChecks).toBe(10);
      expect((res.metrics as any).executedChecks).toBe(5);
    });

    it("extracts boolean fields", () => {
      const output = { progressed: true, strategyChanged: false };
      const res = summarizeOutput(output);
      expect(res.progressed).toBe(true);
      expect(res.strategyChanged).toBe(false);
    });

    it("extracts executedChecks array", () => {
      const output = { executedChecks: [{ command: "ls", status: "success", exitCode: 0 }] };
      const res = summarizeOutput(output);
      expect((res.executedChecks as any)).toHaveLength(1);
      expect((res.executedChecks as any)[0].command).toBe("ls");
    });

    it("extracts riskAssessment object", () => {
      const output = { riskAssessment: { buildRisk: "low", syntaxRisk: "none" } };
      const res = summarizeOutput(output);
      expect((res.riskAssessment as any).buildRisk).toBe("low");
    });

    it("extracts technicalRiskSummary object", () => {
      const output = { technicalRiskSummary: { logicRisk: "high" } };
      const res = summarizeOutput(output);
      expect((res.technicalRiskSummary as any).logicRisk).toBe("high");
    });
  });

  describe("logAgentAudit", () => {
    it("appends log line to task path and global logs", async () => {
      const entry = {
        taskId: "task-1",
        stage: "Research",
        agent: "Researcher",
        event: "stage_started" as const,
        note: "Starting now"
      };
      await logAgentAudit("/tmp/task-path", entry);

      expect(appendText).toHaveBeenCalledTimes(2);
      const call1 = vi.mocked(appendText).mock.calls[0];
      expect(call1[0]).toContain(path.join("/tmp/task-path", "logs", "agent-audit.jsonl"));
      
      const payload = JSON.parse(call1[1]);
      expect(payload.taskId).toBe("task-1");
      expect(payload.event).toBe("stage_started");
      expect(payload.note).toBe("Starting now");

      const call2 = vi.mocked(appendText).mock.calls[1];
      expect(call2[0]).toContain(path.join("/tmp/synx-logs", "agent-audit", "researcher.jsonl"));
    });
  });
});
