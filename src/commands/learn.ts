import { Command } from "commander";
import { ensureGlobalInitialized, ensureProjectInitialized } from "../lib/bootstrap.js";
import { listAgentsWithLearnings, loadAllLearnings, computeLearningStats } from "../lib/learnings.js";

export const learnCommand = new Command("learn")
  .description("Show learning stats and history for agents")
  .argument("[agent-id]", "agent id to inspect (omit for all agents)")
  .option("--limit <n>", "number of recent entries to show per agent", "10")
  .action(async (agentId: string | undefined, options) => {
    await ensureGlobalInitialized();
    await ensureProjectInitialized();

    const limit = Math.max(1, parseInt(String(options.limit), 10) || 10);

    const agents = agentId ? [agentId] : await listAgentsWithLearnings();

    if (!agents.length) {
      console.log("\nNo learning data found.");
      console.log("Learnings are recorded automatically when tasks are approved or reproved via `synx approve` / `synx reprove`.");
      return;
    }

    for (const agent of agents) {
      const entries = await loadAllLearnings(agent);
      if (!entries.length) continue;

      const stats = computeLearningStats(agent, entries);
      const recent = entries.slice(-limit);

      console.log(`\n${"─".repeat(60)}`);
      console.log(`Agent: ${agent}`);
      console.log(`  Total runs : ${stats.total}`);
      console.log(`  Approved   : ${stats.approved}`);
      console.log(`  Reproved   : ${stats.reproved}`);
      console.log(`  Approval % : ${stats.approvalRate}%`);
      if (stats.lastTimestamp) {
        console.log(`  Last run   : ${stats.lastTimestamp.slice(0, 10)}`);
      }

      console.log(`\n  Last ${recent.length} entries:`);
      for (const entry of recent) {
        const icon = entry.outcome === "approved" ? "✅" : "❌";
        const date = entry.timestamp.slice(0, 10);
        console.log(`    ${icon} [${date}] ${entry.taskId} — ${entry.summary.slice(0, 80)}`);
        if (entry.outcome === "reproved" && entry.reproveReason) {
          console.log(`       Feedback: ${entry.reproveReason}`);
        }
      }
    }

    console.log(`\n${"─".repeat(60)}`);
  });
