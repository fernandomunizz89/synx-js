import { useCallback, useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  fetchMetricsOverview,
  fetchTimeline,
  fetchAgents,
  fetchProjects,
  type MetricsOverview,
  type TimelinePoint,
  type AgentRow,
  type ProjectRow,
} from "../api/metrics.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMs(ms: number): string {
  if (!ms || ms <= 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

function formatCost(usd: number): string {
  if (!usd || usd <= 0) return "$0";
  if (usd < 0.001) return "<$0.001";
  return `$${usd.toFixed(3)}`;
}

function formatPct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function shortDate(iso: string): string {
  return iso.slice(5); // MM-DD
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  color,
  sparkData,
  sparkKey,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
  sparkData?: TimelinePoint[];
  sparkKey?: keyof TimelinePoint;
}) {
  return (
    <div style={{
      background: "var(--bg2)",
      border: "1px solid var(--border)",
      borderRadius: 10,
      padding: "16px 20px",
      flex: 1,
      minWidth: 180,
      display: "flex",
      flexDirection: "column",
      gap: 6,
    }}>
      <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </span>
      <span style={{ fontSize: 26, fontWeight: 700, color, lineHeight: 1.1 }}>
        {value}
      </span>
      {sub && <span style={{ fontSize: 11, color: "var(--muted)" }}>{sub}</span>}
      {sparkData && sparkKey && sparkData.length > 1 && (
        <div style={{ height: 32, marginTop: 4 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`spark-${String(sparkKey)}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey={sparkKey as string}
                stroke={color}
                strokeWidth={1.5}
                fill={`url(#spark-${String(sparkKey)})`}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h2 style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function ChartCard({ title, children, height = 220 }: { title: string; children: React.ReactNode; height?: number }) {
  return (
    <div style={{
      background: "var(--bg2)",
      border: "1px solid var(--border)",
      borderRadius: 10,
      padding: "16px 20px",
      flex: 1,
      minWidth: 0,
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg)", marginBottom: 12 }}>{title}</div>
      <div style={{ height }}>
        {children}
      </div>
    </div>
  );
}

// ── Recharts theme ────────────────────────────────────────────────────────────

const CHART_STYLE = {
  fontSize: 11,
  fontFamily: "var(--font)",
};

const TOOLTIP_STYLE = {
  background: "var(--bg3)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  fontSize: 11,
  color: "var(--fg)",
};

const AXIS_COLOR = "var(--muted)";
const GRID_COLOR = "var(--border)";

// Palette aligned to design tokens
const COLORS = {
  teal:   "#14b8a6",
  blue:   "#58a6ff",
  green:  "#3fb950",
  orange: "#f59e0b",
  red:    "#f85149",
  purple: "#a78bfa",
  yellow: "#fbbf24",
  muted:  "#7d8590",
};


// ── Range selector ────────────────────────────────────────────────────────────

type Days = 7 | 30 | 90;

function RangeSelector({ value, onChange }: { value: Days; onChange: (d: Days) => void }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {([7, 30, 90] as Days[]).map((d) => (
        <button
          key={d}
          onClick={() => onChange(d)}
          style={{
            padding: "3px 9px", fontSize: 11, borderRadius: 6, cursor: "pointer",
            border: "1px solid var(--border)",
            background: value === d ? "var(--teal-dim)" : "var(--bg2)",
            color: value === d ? "var(--teal)" : "var(--muted)",
            fontWeight: value === d ? 600 : 400,
          }}
        >
          {d}d
        </button>
      ))}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyChart({ message = "No data yet" }: { message?: string }) {
  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: 12 }}>
      {message}
    </div>
  );
}

// ── MetricsPage ───────────────────────────────────────────────────────────────

export function MetricsPage() {
  const [overview, setOverview] = useState<MetricsOverview | null>(null);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [sparkline, setSparkline] = useState<TimelinePoint[]>([]);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<Days>(30);
  const [refreshedAt, setRefreshedAt] = useState<string>("");

  const load = useCallback(async (rangeDays: Days) => {
    setLoading(true);
    setError(null);
    try {
      const [ov, tl, spark, ag, pr] = await Promise.all([
        fetchMetricsOverview(),
        fetchTimeline(rangeDays),
        fetchTimeline(7),
        fetchAgents(),
        fetchProjects(),
      ]);
      setOverview(ov);
      setTimeline(tl);
      setSparkline(spark);
      setAgents(ag);
      setProjects(pr);
      setRefreshedAt(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load metrics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(days); }, [load, days]);

  useEffect(() => {
    const interval = setInterval(() => void load(days), 60_000);
    return () => clearInterval(interval);
  }, [load, days]);

  const tm = overview?.taskMetrics;

  // Agents sorted by approval rate descending (top 12)
  const topAgents = [...agents]
    .filter((a) => a.approvedCount + a.reprovedCount > 0 || a.stageCount > 0)
    .sort((a, b) => b.approvalRate - a.approvalRate)
    .slice(0, 12);

  // Stage duration top 10 (from overview stageSummary)
  const topStages = [...(overview?.stageSummary ?? [])]
    .filter((s) => s.count > 0)
    .sort((a, b) => b.avgMs - a.avgMs)
    .slice(0, 10);

  // Projects sorted by task count
  const topProjects = [...projects]
    .sort((a, b) => b.taskCount - a.taskCount)
    .slice(0, 10);

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 28 }}>

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 16, fontWeight: 700, color: "var(--fg)" }}>Metrics</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {refreshedAt && (
            <span style={{ fontSize: 11, color: "var(--muted)" }}>Updated {refreshedAt}</span>
          )}
          <button
            onClick={() => void load(days)}
            disabled={loading}
            style={{
              background: "var(--bg2)", border: "1px solid var(--border)",
              borderRadius: 6, padding: "5px 12px", cursor: "pointer",
              fontSize: 12, color: "var(--fg)", opacity: loading ? 0.5 : 1,
            }}
          >
            {loading ? "Loading…" : "↻ Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: "12px 16px", background: "var(--red)18", border: "1px solid var(--red)44", borderRadius: 8, color: "var(--red)", fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* ── C.1 KPI Cards ── */}
      <Section title="Overview">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <KpiCard
            label="Tasks completed"
            value={tm ? String(tm.successfulTasks) : "—"}
            sub={tm ? `of ${tm.totalTasks} total` : undefined}
            color={COLORS.green}
            sparkData={sparkline}
            sparkKey="taskCount"
          />
          <KpiCard
            label="Success rate"
            value={tm ? formatPct(tm.successRate) : "—"}
            sub={tm ? `${tm.failedTasks} failed` : undefined}
            color={tm && tm.successRate >= 0.8 ? COLORS.green : COLORS.orange}
          />
          <KpiCard
            label="Avg lead time"
            value={tm ? formatMs(tm.avgTotalMs) : "—"}
            sub="per task"
            color={COLORS.blue}
          />
          <KpiCard
            label="Total cost"
            value={tm ? formatCost(tm.estimatedCostUsdTotal) : "—"}
            sub="estimated"
            color={COLORS.yellow}
            sparkData={sparkline}
            sparkKey="estimatedCostUsd"
          />
          <KpiCard
            label="QA return rate"
            value={tm ? formatPct(tm.qaReturnRate) : "—"}
            sub="tasks needing QA retry"
            color={tm && tm.qaReturnRate > 0.3 ? COLORS.red : COLORS.teal}
          />
        </div>
      </Section>

      {/* ── C.2 Time-series ── */}
      <Section title="Timeline">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
          <RangeSelector value={days} onChange={setDays} />
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <ChartCard title="Active tasks per day" height={200}>
            {timeline.length === 0 ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeline} margin={{ top: 4, right: 8, bottom: 0, left: -20 }} style={CHART_STYLE}>
                  <defs>
                    <linearGradient id="grad-tasks" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.teal} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={COLORS.teal} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                  <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: AXIS_COLOR, fontSize: 10 }} />
                  <YAxis tick={{ fill: AXIS_COLOR, fontSize: 10 }} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [v, "tasks"]} labelFormatter={shortDate} />
                  <Area type="monotone" dataKey="taskCount" stroke={COLORS.teal} strokeWidth={2} fill="url(#grad-tasks)" dot={false} name="Tasks" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Cost & tokens per day" height={200}>
            {timeline.length === 0 ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={timeline} margin={{ top: 4, right: 8, bottom: 0, left: -20 }} style={CHART_STYLE}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                  <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: AXIS_COLOR, fontSize: 10 }} />
                  <YAxis yAxisId="tokens" tick={{ fill: AXIS_COLOR, fontSize: 10 }} />
                  <YAxis yAxisId="cost" orientation="right" tick={{ fill: COLORS.yellow, fontSize: 10 }} tickFormatter={(v: number) => `$${v.toFixed(3)}`} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v: number, name: string) => [
                      name === "Cost ($)" ? formatCost(v) : v.toLocaleString(),
                      name,
                    ]}
                    labelFormatter={shortDate}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: "var(--muted)" }} />
                  <Bar yAxisId="tokens" dataKey="estimatedTotalTokens" fill={COLORS.blue} opacity={0.6} name="Tokens" radius={[2, 2, 0, 0]} />
                  <Line yAxisId="cost" type="monotone" dataKey="estimatedCostUsd" stroke={COLORS.yellow} strokeWidth={2} dot={false} name="Cost ($)" />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
      </Section>

      {/* ── C.3 Agents ── */}
      <Section title="Agents">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <ChartCard title="Approval rate by agent" height={Math.max(180, topAgents.length * 26)}>
            {topAgents.length === 0 ? <EmptyChart message="No agent decisions recorded" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topAgents} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 130 }} style={CHART_STYLE}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} horizontal={false} />
                  <XAxis type="number" domain={[0, 1]} tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} tick={{ fill: AXIS_COLOR, fontSize: 10 }} />
                  <YAxis type="category" dataKey="agent" tick={{ fill: "var(--fg)", fontSize: 10 }} width={130} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${(v * 100).toFixed(1)}%`, "Approval rate"]} />
                  <Bar dataKey="approvalRate" radius={[0, 3, 3, 0]} name="Approval rate">
                    {topAgents.map((entry, i) => (
                      <Cell key={i} fill={entry.approvalRate >= 0.8 ? COLORS.green : entry.approvalRate >= 0.5 ? COLORS.orange : COLORS.red} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Avg stage duration" height={Math.max(180, topStages.length * 26)}>
            {topStages.length === 0 ? <EmptyChart message="No stage history" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topStages} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 140 }} style={CHART_STYLE}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} horizontal={false} />
                  <XAxis type="number" tickFormatter={(v: number) => formatMs(v)} tick={{ fill: AXIS_COLOR, fontSize: 10 }} />
                  <YAxis type="category" dataKey="stage" tick={{ fill: "var(--fg)", fontSize: 10 }} width={140} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [formatMs(v), "Avg duration"]} />
                  <Bar dataKey="avgMs" fill={COLORS.purple} radius={[0, 3, 3, 0]} name="Avg duration" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
      </Section>

      {/* ── C.4 Projects ── */}
      <Section title="Projects">
        <ChartCard title="Task status by project" height={Math.max(200, topProjects.length * 32)}>
          {topProjects.length === 0 ? <EmptyChart message="No project data" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topProjects} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 100 }} style={CHART_STYLE}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fill: AXIS_COLOR, fontSize: 10 }} />
                <YAxis type="category" dataKey="project" tick={{ fill: "var(--fg)", fontSize: 10 }} width={100} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11, color: "var(--muted)" }} />
                <Bar dataKey="doneCount"         stackId="a" fill={COLORS.green}  name="Done"    radius={[0, 0, 0, 0]} />
                <Bar dataKey="activeCount"        stackId="a" fill={COLORS.teal}   name="Active"  radius={[0, 0, 0, 0]} />
                <Bar dataKey="waitingHumanCount"  stackId="a" fill={COLORS.orange} name="Waiting" radius={[0, 0, 0, 0]} />
                <Bar dataKey="failedCount"        stackId="a" fill={COLORS.red}    name="Failed"  radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </Section>

      {/* ── C.5 Operational ── */}
      <Section title="Operational">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {/* Bottleneck summary card */}
          <div style={{
            background: "var(--bg2)", border: "1px solid var(--border)",
            borderRadius: 10, padding: "16px 20px", flex: 1, minWidth: 200,
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Top bottleneck
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)" }}>
                {overview?.bottlenecks.topStage || "—"}
              </span>
              <span style={{ fontSize: 12, color: COLORS.orange }}>
                {overview?.bottlenecks.topStageAvgMs ? formatMs(overview.bottlenecks.topStageAvgMs) + " avg" : "—"}
              </span>
            </div>
          </div>

          {/* QA return rate */}
          <div style={{
            background: "var(--bg2)", border: "1px solid var(--border)",
            borderRadius: 10, padding: "16px 20px", flex: 1, minWidth: 200,
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              QA return rate
            </span>
            <span style={{ fontSize: 26, fontWeight: 700, color: tm && tm.qaReturnRate > 0.2 ? COLORS.red : COLORS.green }}>
              {tm ? formatPct(tm.qaReturnRate) : "—"}
            </span>
          </div>

          {/* Throttle events */}
          <div style={{
            background: "var(--bg2)", border: "1px solid var(--border)",
            borderRadius: 10, padding: "16px 20px", flex: 1, minWidth: 200,
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Provider throttles
            </span>
            <span style={{ fontSize: 26, fontWeight: 700, color: (overview?.operationalCost.throttleEvents ?? 0) > 0 ? COLORS.orange : COLORS.green }}>
              {overview?.operationalCost.throttleEvents ?? "—"}
            </span>
          </div>

          {/* Retry wait */}
          <div style={{
            background: "var(--bg2)", border: "1px solid var(--border)",
            borderRadius: 10, padding: "16px 20px", flex: 1, minWidth: 200,
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Retry wait time
            </span>
            <span style={{ fontSize: 26, fontWeight: 700, color: COLORS.blue }}>
              {overview?.operationalCost.retryWaitMs ? formatMs(overview.operationalCost.retryWaitMs) : "—"}
            </span>
          </div>
        </div>

        {/* Project rework rates */}
        {overview?.projectQuality.projects && overview.projectQuality.projects.length > 0 && (
          <ChartCard title="Rework rate by project" height={Math.max(160, overview.projectQuality.projects.length * 28)}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={overview.projectQuality.projects.slice(0, 10)}
                layout="vertical"
                margin={{ top: 0, right: 8, bottom: 0, left: 100 }}
                style={CHART_STYLE}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} horizontal={false} />
                <XAxis type="number" domain={[0, 1]} tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} tick={{ fill: AXIS_COLOR, fontSize: 10 }} />
                <YAxis type="category" dataKey="project" tick={{ fill: "var(--fg)", fontSize: 10 }} width={100} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${(v * 100).toFixed(1)}%`]} />
                <Bar dataKey="reworkRate" name="Rework rate" radius={[0, 3, 3, 0]}>
                  {overview.projectQuality.projects.slice(0, 10).map((entry, i) => (
                    <Cell key={i} fill={entry.reworkRate > 0.3 ? COLORS.red : entry.reworkRate > 0.1 ? COLORS.orange : COLORS.green} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </Section>

      <div style={{ height: 20 }} />
    </div>
  );
}
