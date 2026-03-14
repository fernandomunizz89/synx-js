import { Command } from "commander";
import { summarizeMetrics } from "../lib/metrics.js";

export const metricsCommand = new Command("metrics")
  .description("Show timing summary to identify bottlenecks")
  .action(async () => {
    const rows = await summarizeMetrics();
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
  });

function pad(value: string, length: number): string {
  return value.padEnd(length, " ");
}
