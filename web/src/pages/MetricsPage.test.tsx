import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import type { MetricsOverview } from "../api/metrics.js";

// Mock recharts — SVG rendering is not meaningful in jsdom
vi.mock("recharts", () => {
  const Noop = () => null;
  return {
    AreaChart: Noop, Area: Noop,
    BarChart: Noop, Bar: Noop,
    ComposedChart: Noop, Line: Noop,
    XAxis: Noop, YAxis: Noop,
    CartesianGrid: Noop, Tooltip: Noop, Legend: Noop,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Cell: Noop,
  };
});

vi.mock("../api/metrics.js", () => ({
  fetchMetricsOverview: vi.fn(),
  fetchTimeline:        vi.fn().mockResolvedValue([]),
  fetchAgents:          vi.fn().mockResolvedValue([]),
  fetchProjects:        vi.fn().mockResolvedValue([]),
}));

import { fetchMetricsOverview } from "../api/metrics.js";
import { MetricsPage } from "./MetricsPage.js";

const mockOverview: MetricsOverview = {
  taskMetrics: {
    totalTasks: 20, successfulTasks: 16, failedTasks: 2,
    inProgressTasks: 2, successRate: 0.8, avgTotalMs: 4500,
    estimatedCostUsdTotal: 1.2, qaReturnRate: 0.15,
  },
  stageSummary: [],
  learningQuality: { agents: [] },
  projectQuality: { projects: [] },
  bottlenecks: { topStage: "synx-qa-engineer", topStageAvgMs: 9000 },
  operationalCost: { throttleEvents: 0, retryWaitMs: 0 },
};

describe("MetricsPage", () => {
  beforeEach(() => {
    vi.mocked(fetchMetricsOverview).mockResolvedValue(mockOverview);
  });

  it("shows a loading indicator before data arrives, then renders KPI labels", async () => {
    let resolveLoad!: (v: MetricsOverview) => void;
    vi.mocked(fetchMetricsOverview).mockReturnValueOnce(
      new Promise((r) => { resolveLoad = r; })
    );

    render(<MetricsPage />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();

    await act(async () => { resolveLoad(mockOverview); });

    expect(screen.getByText("Tasks completed")).toBeInTheDocument();
    expect(screen.getByText("Success rate")).toBeInTheDocument();
  });

  it("auto-refreshes by calling the API a second time after 60 seconds", async () => {
    vi.useFakeTimers();

    render(<MetricsPage />);
    await act(async () => {}); // flush initial load

    const callsBefore = vi.mocked(fetchMetricsOverview).mock.calls.length;

    await act(async () => { vi.advanceTimersByTime(60_000); });

    expect(vi.mocked(fetchMetricsOverview).mock.calls.length).toBeGreaterThan(callsBefore);

    vi.useRealTimers();
  });
});
