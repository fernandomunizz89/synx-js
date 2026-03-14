import type { TaskMeta } from "./types.js";

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

  private terminalWidth(): number {
    return Math.max(60, process.stdout.columns || 120);
  }

  private clipLine(line: string, width: number): string {
    if (line.length <= width) return line;
    if (width <= 4) return line.slice(0, width);
    return `${line.slice(0, width - 3)}...`;
  }

  render(snapshot: StartProgressSnapshot): void {
    this.tick += 1;
    const spinner = SPINNER_FRAMES[this.tick % SPINNER_FRAMES.length];
    const now = Date.now();
    const width = this.terminalWidth() - 1;

    const counts = {
      active: snapshot.metas.filter((x) => ["new", "in_progress", "waiting_agent"].includes(x.status)).length,
      waitingHuman: snapshot.metas.filter((x) => x.status === "waiting_human").length,
      failed: snapshot.metas.filter((x) => x.status === "failed").length,
      done: snapshot.metas.filter((x) => x.status === "done").length,
    };

    const lines: string[] = [];
    lines.push(
      `${spinner} Engine running | uptime ${formatDuration(now - snapshot.engineStartedAtMs)} | loop ${snapshot.loop} | active ${counts.active} | waiting ${counts.waitingHuman} | failed ${counts.failed} | done ${counts.done}`
    );

    const active = snapshot.metas
      .filter((x) => ["new", "in_progress", "waiting_agent"].includes(x.status))
      .sort((a, b) => a.taskId.localeCompare(b.taskId));

    if (!active.length) {
      lines.push("No active tasks. Waiting for new work...");
    } else {
      for (const meta of active.slice(0, 6)) {
        const progress = progressForMeta(meta);
        const bar = progressBar(progress.ratio);
        const elapsed = formatDuration(now - new Date(meta.createdAt).getTime());
        const current = stageLabel(meta.currentStage);
        const agent = meta.currentAgent || meta.nextAgent || "[none]";
        lines.push(
          `- ${shortTaskId(meta.taskId)} ${bar} ${progress.done}/${progress.total} | ${current} | ${agent} | elapsed ${elapsed}`
        );
      }

      if (active.length > 6) {
        lines.push(`... and ${active.length - 6} more active task(s)`);
      }
    }

    const clippedLines = lines.map((line) => this.clipLine(line, width));

    if (!this.cursorHidden) {
      process.stdout.write("\x1b[?25l");
      this.cursorHidden = true;
    }

    if (this.linesRendered > 0) {
      process.stdout.write(`\x1b[${this.linesRendered}A`);
    }
    process.stdout.write("\x1b[0J");
    process.stdout.write(`${clippedLines.join("\n")}\n`);
    this.linesRendered = clippedLines.length;
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
