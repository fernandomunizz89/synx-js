/**
 * Learning loop — records agent outcomes and injects past performance
 * into future prompts so agents can improve over time.
 *
 * Storage: one JSONL file per agent at .ai-agents/learnings/<agentId>.jsonl
 * Each line is a LearningEntry JSON object.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { learningEntrySchema } from "./schema.js";
import { learningsDir } from "./paths.js";
import { nowIso } from "./utils.js";
import type { LearningEntry, LearningOutcome, PipelineStepContext } from "./types.js";

export { type LearningEntry };

// ─── File helpers ─────────────────────────────────────────────────────────────

/**
 * Converts an agent name/id to a safe filename component.
 * "Synx Back Expert" → "synx-back-expert"
 */
export function agentToFileName(agentId: string): string {
  return agentId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function learningFilePath(agentId: string): string {
  return path.join(learningsDir(), `${agentToFileName(agentId)}.jsonl`);
}

// ─── Write ────────────────────────────────────────────────────────────────────

export async function recordLearning(entry: LearningEntry): Promise<void> {
  const dir = learningsDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.appendFile(learningFilePath(entry.agentId), JSON.stringify(entry) + "\n", "utf8");
}

/**
 * Records a learning entry for each completed pipeline step when a task is approved.
 */
export async function recordPipelineApproval(
  taskId: string,
  pipelineId: string,
  completedSteps: PipelineStepContext[],
): Promise<void> {
  const timestamp = nowIso();
  await Promise.all(
    completedSteps.map((step) =>
      recordLearning({
        timestamp,
        taskId,
        agentId: step.agent,
        summary: step.summary,
        outcome: "approved",
        pipelineId,
        stepIndex: step.stepIndex,
        provider: step.provider,
        model: step.model,
      }),
    ),
  );
}

/**
 * Records a learning entry for the last completed step when a task is reproved.
 */
export async function recordPipelineReproval(
  taskId: string,
  pipelineId: string,
  completedSteps: PipelineStepContext[],
  reproveReason: string,
): Promise<void> {
  if (completedSteps.length === 0) return;
  const lastStep = completedSteps[completedSteps.length - 1];
  await recordLearning({
    timestamp: nowIso(),
    taskId,
    agentId: lastStep.agent,
    summary: lastStep.summary,
    outcome: "reproved",
    reproveReason,
    pipelineId,
    stepIndex: lastStep.stepIndex,
    provider: lastStep.provider,
    model: lastStep.model,
  });
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function loadRecentLearnings(agentId: string, limit = 5): Promise<LearningEntry[]> {
  const filePath = learningFilePath(agentId);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const entries: LearningEntry[] = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        entries.push(learningEntrySchema.parse(JSON.parse(trimmed)));
      } catch {
        // skip malformed lines
      }
    }
    return entries.slice(-limit);
  } catch {
    return [];
  }
}

export async function loadAllLearnings(agentId: string): Promise<LearningEntry[]> {
  return loadRecentLearnings(agentId, Infinity);
}

export async function listAgentsWithLearnings(): Promise<string[]> {
  const dir = learningsDir();
  try {
    const files = await fs.readdir(dir);
    return files.filter((f) => f.endsWith(".jsonl")).map((f) => f.replace(/\.jsonl$/, ""));
  } catch {
    return [];
  }
}

// ─── Prompt enrichment ────────────────────────────────────────────────────────

/**
 * Formats recent learnings into a markdown section to append to a system prompt.
 * Returns empty string when there are no entries.
 */
export function buildLearningsPromptSection(entries: LearningEntry[]): string {
  if (entries.length === 0) return "";

  const lines = entries.map((e, i) => {
    const date = e.timestamp.slice(0, 10);
    const icon = e.outcome === "approved" ? "✅" : "❌";
    const label = e.outcome === "approved" ? "Approved" : "Reproved";
    let text = `${i + 1}. [${date}] ${icon} ${label} — Task: ${e.taskId}\n   Output: "${e.summary}"`;
    if (e.outcome === "reproved" && e.reproveReason) {
      text += `\n   Feedback: "${e.reproveReason}"`;
    }
    return text;
  });

  return `

---

## Your recent performance (last ${entries.length} task${entries.length > 1 ? "s" : ""})

${lines.join("\n\n")}

Use this history: build on what was approved; address feedback from reproved tasks directly.`;
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export interface LearningStats {
  agentId: string;
  total: number;
  approved: number;
  reproved: number;
  approvalRate: number;
  mostRecentOutcome: LearningOutcome | null;
  lastTimestamp: string | null;
}

export function computeLearningStats(agentId: string, entries: LearningEntry[]): LearningStats {
  const approved = entries.filter((e) => e.outcome === "approved").length;
  const reproved = entries.filter((e) => e.outcome === "reproved").length;
  const sorted = [...entries].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return {
    agentId,
    total: entries.length,
    approved,
    reproved,
    approvalRate: entries.length > 0 ? Math.round((approved / entries.length) * 100) : 0,
    mostRecentOutcome: sorted.length > 0 ? sorted[sorted.length - 1].outcome : null,
    lastTimestamp: sorted.length > 0 ? sorted[sorted.length - 1].timestamp : null,
  };
}
