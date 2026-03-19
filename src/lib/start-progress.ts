import cliSpinners from "cli-spinners";
import { createLogUpdate } from "log-update";
import type { TaskMeta } from "./types.js";
import { formatSynxStatus, renderSynxLogo, renderSynxPanel, synxControlFlowDiagram, synxCyan, synxMuted, synxWaiting } from "./synx-ui.js";
import {
  addBlockPadding,
  buildUserInputLines,
  formatDuration,
  leftAlignLogoBlock,
  mergeBlocksHorizontally,
  progressForMeta,
  progressBar,
  renderTextCursor,
  shortTaskId,
  stageLabel,
  taskTone,
  visibleWidth,
} from "./ui-layout-helpers.js";

export { formatDuration, stageRoute, stageLabel, progressForMeta, progressBar, buildUserInputLines } from "./ui-layout-helpers.js";

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
