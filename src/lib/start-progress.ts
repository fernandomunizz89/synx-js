import type { TaskMeta } from "./types.js";
import { formatSynxStatus, renderSynxCard, synxControlFlowDiagram, synxMuted } from "./synx-ui.js";

const SPINNER_FRAMES = ["|", "/", "-", "\\"];
const BAR_WIDTH = 22;

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function stageRoute(meta: TaskMeta): string[] {
  const stagesInHistory = new Set(meta.history.map((x) => x.stage));
  if (stagesInHistory.has("bug-fixer")) {
    return ["dispatcher", "bug-investigator", "bug-fixer", "reviewer", "qa", "pr"];
  }
  if (stagesInHistory.has("bug-investigator")) {
    return ["dispatcher", "bug-investigator", "bug-fixer", "reviewer", "qa", "pr"];
  }
  if (stagesInHistory.has("planner")) {
    return ["dispatcher", "planner", "builder", "reviewer", "qa", "pr"];
  }
  if (meta.type === "Bug") {
    return ["dispatcher", "bug-investigator", "bug-fixer", "reviewer", "qa", "pr"];
  }
  return ["dispatcher", "planner", "builder", "reviewer", "qa", "pr"];
}

function stageLabel(stage: string): string {
  switch (stage) {
    case "dispatcher":
      return "Dispatcher";
    case "planner":
      return "Spec Planner";
    case "bug-investigator":
      return "Bug Investigator";
    case "builder":
      return "Feature Builder";
    case "bug-fixer":
      return "Bug Fixer";
    case "reviewer":
      return "Reviewer";
    case "qa":
      return "QA Validator";
    case "pr":
      return "PR Writer";
    case "approved":
      return "Approved";
    case "submitted":
      return "Submitted";
    default:
      return stage || "[none]";
  }
}

function progressForMeta(meta: TaskMeta): { done: number; total: number; ratio: number } {
  const total = stageRoute(meta).length;
  let done = Math.min(meta.history.length, total);
  let ratio = done / total;

  if (meta.status === "done" || meta.status === "waiting_human") {
    done = total;
    ratio = 1;
  } else if (meta.status === "in_progress") {
    ratio = Math.min(0.99, (done + 0.45) / total);
  } else if (meta.status === "failed") {
    ratio = Math.min(1, (done + 0.2) / total);
  }

  return { done, total, ratio };
}

function progressBar(ratio: number): string {
  const bounded = Math.max(0, Math.min(1, ratio));
  const filled = Math.round(bounded * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  return `[${"#".repeat(filled)}${".".repeat(empty)}]`;
}

function shortTaskId(taskId: string): string {
  if (taskId.length <= 30) return taskId;
  return `${taskId.slice(0, 16)}...${taskId.slice(-11)}`;
}

function statusTone(meta: TaskMeta): "processing" | "success" | "critical_error" | "waiting_human" {
  if (meta.status === "done") return "success";
  if (meta.status === "failed" || meta.status === "blocked") return "critical_error";
  if (meta.status === "waiting_human") return "waiting_human";
  return "processing";
}

function statusBorderColor(meta: TaskMeta): "cyan" | "green" | "red" | "yellow" {
  const tone = statusTone(meta);
  if (tone === "success") return "green";
  if (tone === "critical_error") return "red";
  if (tone === "waiting_human") return "yellow";
  return "cyan";
}

export interface StartProgressSnapshot {
  loop: number;
  engineStartedAtMs: number;
  metas: TaskMeta[];
}

export interface StartProgressRenderer {
  readonly enabled: boolean;
  render(snapshot: StartProgressSnapshot): void;
  stop(): void;
}

class TtyStartProgressRenderer implements StartProgressRenderer {
  readonly enabled = true;
  private linesRendered = 0;
  private tick = 0;
  private cursorHidden = false;

  render(snapshot: StartProgressSnapshot): void {
    this.tick += 1;
    const spinner = SPINNER_FRAMES[this.tick % SPINNER_FRAMES.length];
    const now = Date.now();

    const counts = {
      active: snapshot.metas.filter((x) => ["new", "in_progress", "waiting_agent"].includes(x.status)).length,
      waitingHuman: snapshot.metas.filter((x) => x.status === "waiting_human").length,
      failed: snapshot.metas.filter((x) => x.status === "failed").length,
      done: snapshot.metas.filter((x) => x.status === "done").length,
    };

    const headerCard = renderSynxCard({
      title: "SYNX CONTROL PANEL",
      lines: [
        `${spinner} uptime ${formatDuration(now - snapshot.engineStartedAtMs)} | loop ${snapshot.loop}`,
        `Flow: ${synxControlFlowDiagram()}`,
        `Queues: active ${counts.active} | waiting ${counts.waitingHuman} | failed ${counts.failed} | done ${counts.done}`,
      ],
      borderColor: "cyan",
    });

    const active = snapshot.metas
      .filter((x) => ["new", "in_progress", "waiting_agent"].includes(x.status))
      .sort((a, b) => a.taskId.localeCompare(b.taskId));

    const fallbackFocus = snapshot.metas
      .filter((x) => x.status === "waiting_human" || x.status === "done" || x.status === "failed")
      .sort((a, b) => (new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()))
      .slice(0, 1);

    const focus = active.length ? active.slice(0, 4) : fallbackFocus;
    const taskCards: string[] = [];
    if (!focus.length) {
      taskCards.push(renderSynxCard({
        title: "TASK BUS",
        lines: [synxMuted("No active tasks. Waiting for new work...")],
        borderColor: "cyan",
      }));
    } else {
      for (const meta of focus) {
        const progress = progressForMeta(meta);
        const bar = progressBar(progress.ratio);
        const elapsed = formatDuration(now - new Date(meta.createdAt).getTime());
        const current = stageLabel(meta.currentStage);
        const agent = meta.currentAgent || meta.nextAgent || "[none]";
        taskCards.push(renderSynxCard({
          title: `TASK ${shortTaskId(meta.taskId)}`,
          lines: [
            `State: ${formatSynxStatus(statusTone(meta))} | Type: ${meta.type}`,
            `Stage: ${current} | Agent: ${agent}`,
            `Progress: ${bar} ${progress.done}/${progress.total} | elapsed ${elapsed}`,
            `Route: ${stageRoute(meta).map((stage) => `[${stageLabel(stage)}]`).join(" -> ")}`,
          ],
          borderColor: statusBorderColor(meta),
        }));
      }
      if (active.length > 4) {
        taskCards.push(synxMuted(`... and ${active.length - 4} more active task(s)`));
      }
    }

    const renderedText = [headerCard, ...taskCards].join("\n");
    const renderedLines = renderedText.split("\n").length;

    if (!this.cursorHidden) {
      process.stdout.write("\x1b[?25l");
      this.cursorHidden = true;
    }

    if (this.linesRendered > 0) {
      process.stdout.write(`\x1b[${this.linesRendered}A`);
    }
    process.stdout.write("\x1b[0J");
    process.stdout.write(`${renderedText}\n`);
    this.linesRendered = renderedLines;
  }

  stop(): void {
    if (!this.linesRendered && !this.cursorHidden) return;
    process.stdout.write("\x1b[0m");
    if (this.cursorHidden) {
      process.stdout.write("\x1b[?25h");
      this.cursorHidden = false;
    }
    this.linesRendered = 0;
  }
}

class SilentStartProgressRenderer implements StartProgressRenderer {
  readonly enabled = false;
  render(): void {
    // no-op
  }
  stop(): void {
    // no-op
  }
}

export function createStartProgressRenderer(options: { enabled: boolean }): StartProgressRenderer {
  if (options.enabled && process.stdout.isTTY) return new TtyStartProgressRenderer();
  return new SilentStartProgressRenderer();
}
