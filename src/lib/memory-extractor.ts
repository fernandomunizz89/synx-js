/**
 * Phase 4.1 — Memory Extractor
 *
 * After QA passes (task routed to human review), extract learned facts from the
 * task pipeline and persist them to project memory for future tasks.
 */
import { appendProjectMemoryFacts } from "./project-memory.js";
import { exists, readJson } from "./fs.js";
import { taskDir } from "./paths.js";
import { DONE_FILE_NAMES } from "./constants.js";
import path from "node:path";

export interface MemoryExtractionInput {
  taskId: string;
  taskTitle: string;
  taskType: string;
  agentChain?: string[];
}

interface DispatcherDoneOutput {
  output?: {
    goal?: string;
    context?: string;
    constraints?: string[];
    assumptions?: string[];
    type?: string;
    suggestedChain?: string[];
  };
}

/**
 * Extracts reusable facts from a completed task and persists them to project memory.
 * Called when a task passes QA and reaches human review.
 */
export async function extractAndPersistMemoryFacts(input: MemoryExtractionInput): Promise<void> {
  const patterns: string[] = [];
  const decisions: string[] = [];
  const knownIssues: string[] = [];

  try {
    // Load dispatcher output to extract architectural decisions and constraints
    const dispatcherDonePath = path.join(taskDir(input.taskId), "done", DONE_FILE_NAMES.dispatcher);
    if (await exists(dispatcherDonePath)) {
      const dispatcherDone = await readJson<DispatcherDoneOutput>(dispatcherDonePath);
      const out = dispatcherDone.output;

      if (out?.goal) {
        decisions.push(`Task "${input.taskTitle}" (${input.taskType}): ${out.goal}`);
      }
      if (out?.constraints && out.constraints.length > 0) {
        for (const c of out.constraints.slice(0, 3)) {
          decisions.push(`Constraint for ${input.taskType}: ${c}`);
        }
      }
      if (out?.suggestedChain && out.suggestedChain.length > 0) {
        patterns.push(`Agent chain for ${input.taskType} task: ${out.suggestedChain.join(" → ")}`);
      }
    }
  } catch {
    // Memory extraction is best-effort — never throw
  }

  if (patterns.length > 0 || decisions.length > 0 || knownIssues.length > 0) {
    await appendProjectMemoryFacts({ patterns, decisions, knownIssues }, input.taskId);
  }
}
