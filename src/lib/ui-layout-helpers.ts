import stringWidth from "string-width";
import stripAnsi from "strip-ansi";
import wrapAnsi from "wrap-ansi";
import type { TaskMeta } from "./types.js";
import { synxCyan, synxMuted, synxWaiting } from "./synx-ui.js";

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

  push("dispatcher");
  push("planner");
  if (meta.type === "Bug") push("bug-investigator");

  for (const item of meta.history) push(item.stage);
  push(meta.currentStage);

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

export function visibleWidth(line: string): number {
  return stringWidth(stripAnsi(line));
}

export function leftAlignLogoBlock(text: string): string {
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

export function padRightAnsi(line: string, targetWidth: number): string {
  const pad = Math.max(0, targetWidth - visibleWidth(line));
  return `${line}${" ".repeat(pad)}`;
}

export function mergeBlocksHorizontally(left: string, right: string, gap = 2): string {
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

export function addBlockPadding(text: string, padding: { top: number; right: number; bottom: number; left: number }): string {
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

export function renderTextCursor(waitingHumanMode: boolean, nowMs: number): string {
  const visible = Math.floor(nowMs / 530) % 2 === 0;
  const glyph = visible ? "|" : " ";
  return waitingHumanMode ? synxWaiting(glyph) : synxCyan(glyph);
}

export function shortTaskId(taskId: string): string {
  if (taskId.length <= 44) return taskId;
  return `${taskId.slice(0, 24)}...${taskId.slice(-16)}`;
}

export function taskTone(meta: TaskMeta): "processing" | "success" | "critical_error" | "waiting_human" {
  if (meta.status === "done") return "success";
  if (meta.status === "failed" || meta.status === "blocked") return "critical_error";
  if (meta.status === "waiting_human") return "waiting_human";
  return "processing";
}
