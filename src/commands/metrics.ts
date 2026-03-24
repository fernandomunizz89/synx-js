import { Command } from "commander";
import { buildCollaborationMetricsReport, parseMetricsTimestamp } from "../lib/collaboration-metrics.js";

export const metricsCommand = new Command("metrics")
  .description("Show timing summary to identify bottlenecks")
  .option("--since <timestamp>", "filter metrics from this timestamp (epoch ms, ISO, or YYYYMMDD-HHmmss)")
  .option("--until <timestamp>", "filter metrics until this timestamp (epoch ms, ISO, or YYYYMMDD-HHmmss)")
  .option("--json", "output collaboration metrics as JSON")
  .action(async (options: { since?: string; until?: string; json?: boolean }) => {
    const sinceMs = parseMetricsTimestamp(options.since);
    const untilMs = parseMetricsTimestamp(options.until);
    if (options.since && sinceMs === null) {
      throw new Error(`Invalid --since timestamp: ${options.since}`);
    }
    if (options.until && untilMs === null) {
      throw new Error(`Invalid --until timestamp: ${options.until}`);
    }

    const report = await buildCollaborationMetricsReport({
      sinceMs: sinceMs ?? undefined,
      untilMs: untilMs ?? undefined,
    });

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    const rows = report.stageSummary;
    if (!rows.length) {
      console.log("\nNo timing data found yet.");
      return;
    }

    console.log("\nStage timing summary");
    console.log("stage                     count   avg(ms)   min(ms)   max(ms)   total(ms)");
    console.log("--------------------------------------------------------------------------");
    for (const row of rows) {
      console.log(`${pad(row.stage, 24)} ${pad(String(row.count), 6)} ${pad(String(row.avgMs), 9)} ${pad(String(row.minMs), 9)} ${pad(String(row.maxMs), 9)} ${row.totalMs}`);
    }

    const slowest = rows[0];
    console.log(`\nCurrent bottleneck candidate: ${slowest.stage} (avg ${slowest.avgMs}ms)`);

    console.log("\nCollaboration metrics");
    if (typeof report.window.sinceMs === "number" || typeof report.window.untilMs === "number") {
      console.log(`- Window: ${formatWindow(report.window.sinceMs, report.window.untilMs)}`);
    } else {
      console.log("- Window: full available logs");
    }
    console.log(`- Tasks: total=${report.taskMetrics.totalTasks} | terminal=${report.taskMetrics.terminalTasks} | success=${report.taskMetrics.successfulTasks} | failed=${report.taskMetrics.failedTasks} | in_progress=${report.taskMetrics.inProgressTasks}`);
    console.log(`- Success rate (terminal): ${pct(report.taskMetrics.successRate)}`);
    console.log(`- Avg total/task: ${report.taskMetrics.avgTotalMs}ms | p95: ${report.taskMetrics.p95TotalMs}ms`);
    console.log(`- Avg time to first diagnosis: ${report.taskMetrics.timeToFirstDiagnosisAvgMs}ms | p95: ${report.taskMetrics.timeToFirstDiagnosisP95Ms}ms`);
    console.log(`- Avg retries/task: ${report.taskMetrics.avgRetriesPerTask} | handoffs/task: ${report.taskMetrics.avgHandoffsPerTask} | loops/task: ${report.taskMetrics.avgLoopsPerTask}`);
    console.log(`- QA return rate: ${pct(report.taskMetrics.qaReturnRate)} | full builds/task: ${report.taskMetrics.fullBuildChecksPerTask}`);
    console.log(`- Queue latency avg: ${report.taskMetrics.avgQueueLatencyMs}ms | p95: ${report.taskMetrics.queueLatencyP95Ms}ms`);
    console.log(`- Estimated tokens: total=${report.taskMetrics.estimatedTotalTokens} (in=${report.taskMetrics.estimatedInputTokensTotal}, out=${report.taskMetrics.estimatedOutputTokensTotal}) | avg/task=${report.taskMetrics.avgEstimatedTokensPerTask}`);
    console.log(`- Estimated cost (USD): total=${report.taskMetrics.estimatedCostUsdTotal.toFixed(6)} | avg/task=${report.taskMetrics.avgEstimatedCostUsdPerTask.toFixed(6)}`);

    console.log("\nCollaboration quality");
    console.log(`- Useful logs: ${report.collaboration.logsUseful} | informative logs: ${report.collaboration.logsInformative} | useful ratio: ${pct(report.collaboration.usefulLogRatio)}`);
    console.log(`- Loop totals: QA returns=${report.collaboration.loopsByType.qaReturnsTotal} | quality-repair retries=${report.collaboration.loopsByType.qualityRepairRetriesTotal}`);
    const learningQuality = report.learningQuality || { agents: [], capabilities: [] };
    const topAgentLearning = learningQuality.agents[0];
    const topCapabilityLearning = learningQuality.capabilities[0];
    if (topAgentLearning || topCapabilityLearning) {
      console.log("- Learning quality:");
      if (topAgentLearning) {
        console.log(`  top agent=${topAgentLearning.agent} (approval ${pct(topAgentLearning.approvalRate)} on ${topAgentLearning.total} outcomes)`);
      }
      if (topCapabilityLearning) {
        console.log(`  top capability=${topCapabilityLearning.capability} (approval ${pct(topCapabilityLearning.approvalRate)} on ${topCapabilityLearning.total} outcomes)`);
      }
    } else {
      console.log("- Learning quality: no learning outcomes recorded in this window");
    }

    const projectQuality = report.projectQuality || {
      overall: {
        projects: 0,
        avgDecompositionQuality: 0,
        avgReworkRate: 0,
        avgQaReturnRate: 0,
        avgHumanInterventionRate: 0,
        avgDeliveryLeadTimeMs: 0,
      },
      projects: [],
    };
    console.log("\nProject quality");
    console.log(`- Projects tracked: ${projectQuality.overall.projects}`);
    console.log(`- Avg decomposition quality: ${pct(projectQuality.overall.avgDecompositionQuality)}`);
    console.log(`- Avg rework rate: ${pct(projectQuality.overall.avgReworkRate)} | avg QA return rate: ${pct(projectQuality.overall.avgQaReturnRate)}`);
    console.log(`- Avg human intervention rate: ${pct(projectQuality.overall.avgHumanInterventionRate)} | avg lead time: ${projectQuality.overall.avgDeliveryLeadTimeMs}ms`);
    if (projectQuality.projects.length) {
      const riskiestProject = projectQuality.projects[0];
      console.log(`- Highest rework project: ${riskiestProject.project} (rework ${pct(riskiestProject.reworkRate)}, decomposition ${pct(riskiestProject.decompositionQuality)})`);
    }

    console.log("\nBottlenecks");
    console.log(`- Top stage: ${report.bottlenecks.topStage} (avg ${report.bottlenecks.topStageAvgMs}ms)`);
    console.log(`- Implementer share of stage time: ${pct(report.bottlenecks.implementerShare)} | avg implementer ms/task: ${report.bottlenecks.implementerAvgMsPerTask}`);
    console.log(`- Implementer likely bottleneck: ${report.bottlenecks.implementerLikelyBottleneck ? "yes" : "no"}`);

    console.log("\nOperational overhead");
    console.log(`- Retry-added wait: ${report.operationalCost.retryWaitMs}ms`);
    console.log(`- Polling sleep time: ${report.operationalCost.pollingSleepMs}ms | loops: ${report.operationalCost.pollingLoops} | processed stages in loops: ${report.operationalCost.pollingProcessedStages}`);
    console.log(`- Provider throttle events: ${report.operationalCost.throttleEvents}`);
    console.log(`- Log volume: ${report.operationalCost.logLines} lines | ${report.operationalCost.logBytes} bytes`);

    if (report.failuresByCategory.length) {
      console.log("\nFailure categories");
      for (const row of report.failuresByCategory.slice(0, 8)) {
        console.log(`- ${row.category}: ${row.count}`);
      }
    } else {
      console.log("\nFailure categories");
      console.log("- none in selected window");
    }
  });

function pad(value: string, length: number): string {
  return value.padEnd(length, " ");
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatWindow(sinceMs: number | undefined, untilMs: number | undefined): string {
  const since = typeof sinceMs === "number" ? new Date(sinceMs).toISOString() : "-inf";
  const until = typeof untilMs === "number" ? new Date(untilMs).toISOString() : "+inf";
  return `${since} -> ${until}`;
}
