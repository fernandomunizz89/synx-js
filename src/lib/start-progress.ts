import cliSpinners from "cli-spinners";
import { createLogUpdate } from "log-update";
import stringWidth from "string-width";
import stripAnsi from "strip-ansi";
import wrapAnsi from "wrap-ansi";
import type { TaskMeta } from "./types.js";
import { formatSynxStatus, renderSynxLogo, renderSynxPanel, synxControlFlowDiagram, synxCyan, synxMuted, synxWaiting } from "./synx-ui.js";

const BAR_WIDTH = 22;

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function stageRoute(meta: TaskMeta): string[] {
  const route: string[] = [];
  const push = (stage: string | undefined) => {
    if (!stage) return;
    if (!route.includes(stage)) route.push(stage);
  };

  // Baseline (legacy-free): keeps progress bar computation stable.
  push("dispatcher");
  push("planner");
  if (meta.type === "Bug") push("bug-investigator");

  // Prefer the actual execution history.
  for (const item of meta.history) push(item.stage);
  push(meta.currentStage);

  // Implied next stage.
  if (meta.status === "waiting_human") {
    push("human-review");
  } else if (meta.status === "waiting_agent") {
    const nextStageByAgent: Partial<Record<TaskMeta["nextAgent"], string>> = {
      Dispatcher: "dispatcher",
      "Synx Front Expert": "synx-front-expert",
      "Synx Mobile Expert": "synx-mobile-expert",
      "Synx Back Expert": "synx-back-expert",
      "Synx QA Engineer": "synx-qa-engineer",
      "Synx SEO Specialist": "synx-seo-specialist",
      "Human Review": "human-review",
    };
    push(nextStageByAgent[meta.nextAgent]);
  }

  return route;
}

export function stageLabel(stage: string): string {
  switch (stage) {
    case "dispatcher":
      return "Dispatcher";
    case "planner":
      return "Planner";
    case "planner:research":
      return "Researcher";
    case "bug-investigator":
      return "Bug Investigator";
    case "builder":
      return "Feature Builder";
    case "builder:research":
      return "Researcher";
    case "synx-front-expert":
      return "Synx Front Expert";
    case "synx-mobile-expert":
      return "Synx Mobile Expert";
    case "synx-back-expert":
      return "Synx Back Expert";
    case "synx-qa-engineer":
      return "Synx QA Engineer";
    case "synx-seo-specialist":
      return "Synx SEO Specialist";
    case "qa":
      return "QA Validator";
    case "approved":
      return "Approved";
    case "submitted":
      return "Submitted";
    default:
      return stage || "[none]";
  }
}

export function progressForMeta(meta: TaskMeta): { done: number; total: number; ratio: number } {
  const total = stageRoute(meta).length;
  let done = Math.min(meta.history.length, total);
  let ratio = done / total;

  if (meta.status === "done" || meta.status === "waiting_human") {
    done = total;
    ratio = 1;
  } else if (meta.status === "in_progress") {
    ratio = Math.min(0.99, (done + 0.4) / total);
  } else if (meta.status === "failed" || meta.status === "blocked" || meta.history.some(h => h.stage === "bug-investigator" && h.status === "done")) {
    ratio = Math.min(1, (done + 0.2) / total);
  }

  return { done, total, ratio };
}

export function progressBar(ratio: number): string {
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

function visibleWidth(line: string): number {
  return stringWidth(stripAnsi(line));
}

function leftAlignLogoBlock(text: string): string {
  const lines = text.split("\n");
  const contentLines = lines.filter((line) => line.trim().length > 0);
  if (!contentLines.length) return text;
  const commonLeading = Math.min(
    ...contentLines.map((line) => {
      const match = line.match(/^ */);
      return match ? match[0].length : 0;
    }),
  );
  if (!Number.isFinite(commonLeading) || commonLeading <= 0) return text;
  return lines.map((line) => line.slice(Math.min(commonLeading, line.length))).join("\n");
}

function padRightAnsi(line: string, targetWidth: number): string {
  const pad = Math.max(0, targetWidth - visibleWidth(line));
  return `${line}${" ".repeat(pad)}`;
}

function mergeBlocksHorizontally(left: string, right: string, gap = 2): string {
  const leftLines = left.split("\n");
  const rightLines = right.split("\n");
  const rows = Math.max(leftLines.length, rightLines.length);
  const leftWidth = Math.max(0, ...leftLines.map((line) => visibleWidth(line)));
  const spacer = " ".repeat(gap);
  const output: string[] = [];

  for (let i = 0; i < rows; i += 1) {
    const leftLine = leftLines[i] || "";
    const rightLine = rightLines[i] || "";
    output.push(`${padRightAnsi(leftLine, leftWidth)}${spacer}${rightLine}`);
  }
  return output.join("\n");
}

function addBlockPadding(text: string, padding: { top: number; right: number; bottom: number; left: number }): string {
  const lines = text.split("\n");
  const visibleMax = Math.max(0, ...lines.map((line) => visibleWidth(line)));
  const paddedLines = lines.map((line) => `${" ".repeat(padding.left)}${line}${" ".repeat(padding.right)}`);
  const blankLine = " ".repeat(padding.left + visibleMax + padding.right);
  const top = Array.from({ length: Math.max(0, padding.top) }, () => blankLine);
  const bottom = Array.from({ length: Math.max(0, padding.bottom) }, () => blankLine);
  return [...top, ...paddedLines, ...bottom].join("\n");
}

export function buildUserInputLines(args: {
  width: number;
  promptIndicator: string;
  promptCursor: string;
  inputBuffer: string;
  placeholder: string;
}): string[] {
  const contentWidth = Math.max(18, args.width - 8);
  const maxLines = 5;
  const prefix = `${args.promptIndicator} `;
  const placeholderLine = `${prefix}${synxMuted(args.placeholder)}${args.promptCursor}`;

  if (!args.inputBuffer.trim()) return [placeholderLine];

  const fullLine = `${prefix}${args.inputBuffer}${args.promptCursor}`;
  const wrapped = wrapAnsi(fullLine, contentWidth, { hard: false, trim: false }).split("\n");

  if (wrapped.length <= maxLines) return wrapped;
  const tail = wrapped.slice(-maxLines);
  tail[0] = `${synxMuted("...")} ${tail[0]}`;
  return tail;
}

function renderTextCursor(waitingHumanMode: boolean, nowMs: number): string {
  const visible = Math.floor(nowMs / 530) % 2 === 0;
  const glyph = visible ? "|" : " ";
  return waitingHumanMode ? synxWaiting(glyph) : synxCyan(glyph);
}

export interface StartProgressSnapshot {
  loop: number;
  engineStartedAtMs: number;
  metas: TaskMeta[];
  paused: boolean;
  enginePanelHasCritical: boolean;
  logViewMode: "console" | "event_stream";
  interactionMode: "command" | "human_input";
  inputBuffer: string;
  humanInputLines: string[];
  consoleLogLines: string[];
  eventLogLines: string[];
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
  private readonly heartbeat: NodeJS.Timeout;
  private lastFrameLineCount = 0;
  private lastSnapshot: StartProgressSnapshot | null = null;
  private staticFrame: StartProgressStaticFrame = {
    headerContextLines: [],
    fixedControlPanelLines: [],
    enginePanelLines: [],
  };
  private resizePending = false;
  private readonly handleResize = (): void => {
    if (this.resizePending) return;
    this.resizePending = true;
    setTimeout(() => {
      this.resizePending = false;
      this.draw();
    }, 24);
  };

  constructor() {
    if (process.stdout.isTTY) {
      process.stdout.on("resize", this.handleResize);
    }
    this.heartbeat = setInterval(() => {
      if (!this.lastSnapshot) return;
      this.draw();
    }, 350);
    this.heartbeat.unref();
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
      paused: false,
      enginePanelHasCritical: false,
      logViewMode: "console",
      interactionMode: "command",
      inputBuffer: "",
      humanInputLines: [] as string[],
      consoleLogLines: [] as string[],
      eventLogLines: [] as string[],
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

    const configPanel = renderSynxPanel({
      title: "CONFIG",
      borderColor: "cyan",
      width,
      lines: this.staticFrame.fixedControlPanelLines,
    });

    const enginePanel = renderSynxPanel({
      title: "ENGINE",
      borderColor: snapshot.enginePanelHasCritical ? "red" : "magenta",
      width,
      lines: this.staticFrame.enginePanelLines,
    });

    const liveControlPanel = renderSynxPanel({
      title: "SYNX CONTROL PANEL",
      borderColor: "cyan",
      width,
      lines: [
        `Uptime: ${synxCyan(formatDuration(now - snapshot.engineStartedAtMs))}`,
        `Engine: ${snapshot.paused ? synxWaiting("Paused") : formatSynxStatus("processing")}`,
        `Flow: ${synxControlFlowDiagram()}`,
        `Queues: active ${counts.active} | waiting ${counts.waitingHuman} | failed ${counts.failed} | done ${counts.done}`,
      ],
    });

    const active = snapshot.metas
      .filter((x) => ["new", "in_progress", "waiting_agent"].includes(x.status))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    const taskBusLines: string[] = [];
    const taskSpinner = synxCyan(spinner);
    const current = active[0];
    if (!current) {
      taskBusLines.push(synxMuted("No active tasks. Waiting for new work..."));
    } else {
      const progress = progressForMeta(current);
      const currentStage = stageLabel(current.currentStage);
      const currentAgent = current.currentAgent || current.nextAgent || "[none]";
      taskBusLines.push(`${taskSpinner} Task: ${shortTaskId(current.taskId)} | Type: ${current.type}`);
      taskBusLines.push(`State: ${formatSynxStatus(taskTone(current))} | Stage: ${currentStage} | Agent: ${currentAgent}`);
      taskBusLines.push(`Progress: ${progressBar(progress.ratio)} ${progress.done}/${progress.total}`);
    }

    const taskBus = renderSynxPanel({
      title: "TASK BUS",
      borderColor: "cyan",
      width,
      lines: taskBusLines,
    });

    const humanInputPanel = snapshot.humanInputLines.length
      ? renderSynxPanel({
        title: "HUMAN INPUT",
        borderColor: "yellow",
        width,
        lines: snapshot.humanInputLines,
      })
      : "";

    const isConsoleView = snapshot.logViewMode === "console";
    const eventLines = isConsoleView
      ? (snapshot.consoleLogLines.length ? snapshot.consoleLogLines.slice(-5) : [synxMuted("No console messages yet.")])
      : (snapshot.eventLogLines.length ? snapshot.eventLogLines.slice(-5) : [synxMuted("No events yet. Waiting for activity...")]);
    const researcherActive = snapshot.metas.some((meta) =>
      meta.currentStage.endsWith(":research")
      && ["new", "in_progress", "waiting_agent"].includes(meta.status),
    );
    if (!isConsoleView && researcherActive) {
      eventLines.unshift(`${synxCyan(spinner)} 🌐 Searching Web...`);
      while (eventLines.length > 5) eventLines.pop();
    }
    const eventPanel = renderSynxPanel({
      title: isConsoleView ? "CONSOLE" : "EVENT STREAM",
      borderColor: isConsoleView ? "cyan" : "magenta",
      width,
      lines: eventLines,
    });

    const waitingHumanMode = snapshot.interactionMode === "human_input";
    const promptCursor = renderTextCursor(waitingHumanMode, now);
    const promptIndicator = waitingHumanMode ? synxWaiting("❯") : synxCyan("❯");
    const inputLines = buildUserInputLines({
      width,
      promptIndicator,
      promptCursor,
      inputBuffer: snapshot.inputBuffer,
      placeholder: waitingHumanMode ? "[reply to continue...]" : "[waiting for command...]",
    });
    const inputPanel = renderSynxPanel({
      title: "USER INPUT",
      borderColor: waitingHumanMode ? "yellow" : "cyan",
      width,
      lines: inputLines,
    });

    const viewToggle = isConsoleView ? "Event Stream" : "Console";
    const quickActionsLine = `${synxMuted("Quick Actions:")} ${synxCyan("[?] Commands")} | ${synxCyan("[F1] Help")} | ${synxCyan("[F2] New Task")} | ${synxCyan("[F3] Pause")} | ${synxCyan(`[F4] ${viewToggle}`)} | ${synxCyan("[F10] Exit")}`;

    const lineCount = (text: string): number => text.split("\n").length;
    const maxLines = Math.max(10, (process.stdout.rows || 24) - 1);
    const headerLines = this.staticFrame.headerContextLines.slice(0, 2);
    const logo = addBlockPadding(leftAlignLogoBlock(renderSynxLogo(width, "auto")), {
      top: 1,
      right: 2,
      bottom: 1,
      left: 2,
    });
    const logoWidth = Math.max(0, ...logo.split("\n").map((line) => visibleWidth(line)));
    const topGap = 2;
    const minConfigWidth = 34;
    const rightConfigWidth = Math.max(0, width - logoWidth - topGap);
    const configOnRight = rightConfigWidth >= minConfigWidth;
    const topBlock = configOnRight
      ? mergeBlocksHorizontally(logo, renderSynxPanel({
        title: "CONFIG",
        borderColor: "cyan",
        width: rightConfigWidth,
        lines: this.staticFrame.fixedControlPanelLines,
      }), topGap)
      : logo;

    const sections: string[] = [topBlock];
    let used = lineCount(topBlock);

    for (const headerLine of headerLines) {
      const needed = lineCount(headerLine);
      if (used + needed <= maxLines) {
        sections.push(headerLine);
        used += needed;
      }
    }

    // Priority (when height is tight): keep user input and live task panels first.
    const optionalPanels = configOnRight ? [enginePanel, eventPanel] : [enginePanel, configPanel, eventPanel];
    for (const panel of optionalPanels) {
      const needed = lineCount(panel);
      if (used + needed <= maxLines) {
        sections.push(panel);
        used += needed;
      }
    }

    const requiredPanels = [liveControlPanel, taskBus, inputPanel];
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

    if (humanInputPanel) {
      const needed = lineCount(humanInputPanel);
      if (used + needed <= maxLines) {
        sections.push(humanInputPanel);
        used += needed;
      }
    }

    sections.push(quickActionsLine);
    const frame = sections.join("\n");

    const currentLineCount = frame.split("\n").length;
    if (this.resizePending || currentLineCount < this.lastFrameLineCount) {
      this.log.clear();
    }
    this.log(frame);
    this.lastFrameLineCount = currentLineCount;
  }

  stop(): void {
    clearInterval(this.heartbeat);
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
