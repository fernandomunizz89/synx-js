import cliSpinners from "cli-spinners";
import { createLogUpdate } from "log-update";
import type { TaskMeta } from "./types.js";
import { formatSynxStatus, renderSynxLogo, renderSynxPanel, synxControlFlowDiagram, synxMuted, type SynxLogoStyle } from "./synx-ui.js";

const BAR_WIDTH = 22;

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
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
      return "Planner";
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
    ratio = Math.min(0.99, (done + 0.4) / total);
  } else if (meta.status === "failed" || meta.status === "blocked") {
    ratio = Math.min(1, (done + 0.2) / total);
  }

  return { done, total, ratio };
}

function progressBar(ratio: number): string {
  const bounded = Math.max(0, Math.min(1, ratio));
  const filled = Math.round(bounded * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  return `[${"█".repeat(filled)}${"·".repeat(empty)}]`;
}

function shortTaskId(taskId: string): string {
  if (taskId.length <= 44) return taskId;
  return `${taskId.slice(0, 24)}...${taskId.slice(-16)}`;
}

function taskTone(meta: TaskMeta): "processing" | "success" | "critical_error" | "waiting_human" {
  if (meta.status === "done") return "success";
  if (meta.status === "failed" || meta.status === "blocked") return "critical_error";
  if (meta.status === "waiting_human") return "waiting_human";
  return "processing";
}

export interface StartProgressSnapshot {
  loop: number;
  engineStartedAtMs: number;
  metas: TaskMeta[];
}

export interface StartProgressStaticFrame {
  headerContextLines: string[];
  fixedControlPanelLines: string[];
  enginePanelLines: string[];
}

export interface StartProgressRenderer {
  readonly enabled: boolean;
  setStaticFrame(frame: StartProgressStaticFrame): void;
  render(snapshot: StartProgressSnapshot): void;
  stop(): void;
}

class TtyStartProgressRenderer implements StartProgressRenderer {
  readonly enabled = true;
  private tick = 0;
  private readonly log = createLogUpdate(process.stdout);
  private readonly frames = cliSpinners.dots12.frames;
  private lastSnapshot: StartProgressSnapshot | null = null;
  private staticFrame: StartProgressStaticFrame = {
    headerContextLines: [],
    fixedControlPanelLines: [],
    enginePanelLines: [],
  };
  private resizePending = false;
  private needsFullClear = true;
  private readonly handleResize = (): void => {
    if (this.resizePending) return;
    this.resizePending = true;
    setTimeout(() => {
      this.resizePending = false;
      this.needsFullClear = true;
      this.draw();
    }, 24);
  };

  constructor() {
    if (process.stdout.isTTY) {
      process.stdout.on("resize", this.handleResize);
    }
  }

  setStaticFrame(frame: StartProgressStaticFrame): void {
    this.staticFrame = frame;
    this.draw();
  }

  render(snapshot: StartProgressSnapshot): void {
    this.lastSnapshot = snapshot;
    this.draw();
  }

  private draw(): void {
    const snapshot = this.lastSnapshot || {
      loop: 0,
      engineStartedAtMs: Date.now(),
      metas: [] as TaskMeta[],
    };
    this.tick += 1;
    const spinner = this.frames[this.tick % this.frames.length];
    const now = Date.now();
    const width = process.stdout.columns || 80;

    const counts = {
      active: snapshot.metas.filter((x) => ["new", "in_progress", "waiting_agent"].includes(x.status)).length,
      waitingHuman: snapshot.metas.filter((x) => x.status === "waiting_human").length,
      failed: snapshot.metas.filter((x) => x.status === "failed").length,
      done: snapshot.metas.filter((x) => x.status === "done").length,
    };

    const fixedControlPanel = renderSynxPanel({
      title: "SYNX CONTROL PANEL",
      borderColor: "cyan",
      width,
      lines: this.staticFrame.fixedControlPanelLines,
    });

    const enginePanel = renderSynxPanel({
      title: "ENGINE",
      borderColor: "magenta",
      width,
      lines: this.staticFrame.enginePanelLines,
    });

    const liveControlPanel = renderSynxPanel({
      title: "SYNX CONTROL PANEL",
      borderColor: "cyan",
      width,
      lines: [
        `${spinner} uptime ${formatDuration(now - snapshot.engineStartedAtMs)} | loop ${snapshot.loop}`,
        `Flow: ${synxControlFlowDiagram()}`,
        `Queues: active ${counts.active} | waiting ${counts.waitingHuman} | failed ${counts.failed} | done ${counts.done}`,
      ],
    });

    const active = snapshot.metas
      .filter((x) => ["new", "in_progress", "waiting_agent"].includes(x.status))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    const taskBusLines: string[] = [];
    const current = active[0];
    if (!current) {
      taskBusLines.push(synxMuted("No active tasks. Waiting for new work..."));
    } else {
      const progress = progressForMeta(current);
      const currentStage = stageLabel(current.currentStage);
      const currentAgent = current.currentAgent || current.nextAgent || "[none]";
      taskBusLines.push(`Task: ${shortTaskId(current.taskId)} | Type: ${current.type}`);
      taskBusLines.push(`State: ${formatSynxStatus(taskTone(current))} | Stage: ${currentStage} | Agent: ${currentAgent}`);
      taskBusLines.push(`Progress: ${progressBar(progress.ratio)} ${progress.done}/${progress.total}`);
    }

    const taskBus = renderSynxPanel({
      title: "TASK BUS",
      borderColor: "cyan",
      width,
      lines: taskBusLines,
    });

    const lineCount = (text: string): number => text.split("\n").length;
    const maxLines = Math.max(10, (process.stdout.rows || 24) - 1);
    const headerLines = this.staticFrame.headerContextLines.slice(0, 2);
    const logo = renderSynxLogo(width, "auto");

    const sections: string[] = [logo];
    let used = lineCount(logo);

    for (const headerLine of headerLines) {
      const needed = lineCount(headerLine);
      if (used + needed <= maxLines) {
        sections.push(headerLine);
        used += needed;
      }
    }

    // Priority (when height is tight): keep fixed control panel and drop engine first.
    const optionalPanels = [enginePanel, fixedControlPanel];
    for (const panel of optionalPanels) {
      const needed = lineCount(panel);
      if (used + needed <= maxLines) {
        sections.push(panel);
        used += needed;
      }
    }

    const requiredPanels = [liveControlPanel, taskBus];
    for (const panel of requiredPanels) {
      const needed = lineCount(panel);
      if (used + needed <= maxLines) {
        sections.push(panel);
        used += needed;
        continue;
      }
      // When space is tight we still keep structural integrity by adding the panel and
      // dropping lower-priority optional sections above.
      while (sections.length > 1 && used + needed > maxLines) {
        const removed = sections.splice(1, 1)[0];
        used -= lineCount(removed);
      }
      sections.push(panel);
      used += needed;
    }

    const frame = sections.join("\n");

    if (this.needsFullClear) {
      this.log.clear();
      process.stdout.write("\x1b[2J\x1b[0;0H");
      this.needsFullClear = false;
    }
    this.log(frame);
  }

  stop(): void {
    if (process.stdout.isTTY) {
      process.stdout.off("resize", this.handleResize);
    }
    this.log.done();
  }
}

class SilentStartProgressRenderer implements StartProgressRenderer {
  readonly enabled = false;
  setStaticFrame(): void {
    // no-op
  }
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
