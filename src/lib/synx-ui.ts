import boxen, { type Options as BoxenOptions } from "boxen";
import gradient from "gradient-string";

const CYAN = "#00ffff";
const PURPLE = "#bc13fe";
const GREEN = "#00ff8f";
const RED = "#ff3b3b";
const YELLOW = "#ffd166";
const RESET = "\x1b[0m";

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace("#", "").trim();
  const value = normalized.length === 3
    ? normalized.split("").map((x) => `${x}${x}`).join("")
    : normalized;
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return { r: Number.isFinite(r) ? r : 255, g: Number.isFinite(g) ? g : 255, b: Number.isFinite(b) ? b : 255 };
}

function paintHex(hex: string, text: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `\x1b[38;2;${r};${g};${b}m${text}${RESET}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatSynxTimestamp(atIso = new Date().toISOString()): string {
  const at = new Date(atIso);
  if (Number.isNaN(at.getTime())) return "1970-01-01 00:00:00";
  return `${at.getUTCFullYear()}-${pad2(at.getUTCMonth() + 1)}-${pad2(at.getUTCDate())} ${pad2(at.getUTCHours())}:${pad2(at.getUTCMinutes())}:${pad2(at.getUTCSeconds())}`;
}

export function synxCyan(text: string): string {
  return paintHex(CYAN, text);
}

export function synxPurple(text: string): string {
  return paintHex(PURPLE, text);
}

export function synxSuccess(text: string): string {
  return paintHex(GREEN, text);
}

export function synxCritical(text: string): string {
  return paintHex(RED, text);
}

export function synxWaiting(text: string): string {
  return paintHex(YELLOW, text);
}

export function synxMuted(text: string): string {
  return `\x1b[90m${text}${RESET}`;
}

export function synxBold(text: string): string {
  return `\x1b[1m${text}${RESET}`;
}

export function formatSynxStreamLog(message: string, source = "SYNX", atIso = new Date().toISOString()): string {
  return `[${formatSynxTimestamp(atIso)}] :: ${source} :: ${message}`;
}

export type SynxStatusTone = "processing" | "success" | "critical_error" | "waiting_human";

export function formatSynxStatus(tone: SynxStatusTone): string {
  if (tone === "processing") return synxCyan("Processing");
  if (tone === "success") return synxSuccess("Success");
  if (tone === "critical_error") return synxCritical("Critical Error");
  return synxWaiting("Waiting Human");
}

export function synxControlFlowDiagram(): string {
  return `${synxCyan("[SYNX]")} ${synxPurple("➔")} ${synxCyan("[Dispatcher]")} ${synxPurple("➔")} ${synxCyan("[Planner]")}`;
}

export function renderSynxLogo(): string {
  const wireframe = [
    "╔═╗╦ ╦╔╗╔╔═╗",
    "╚═╗╚╦╝║║║╚═╗",
    "╚═╝ ╩ ╝╚╝╚═╝",
    "[ SYNTHETIC AGENT ORCHESTRATOR v5.0 ]",
  ].join("\n");
  return gradient([CYAN, PURPLE]).multiline(wireframe);
}

export function renderSynxCard(args: {
  title?: string;
  lines: string[];
  borderColor?: BoxenOptions["borderColor"];
  dimBorder?: boolean;
}): string {
  const content = args.lines.join("\n");
  const card = boxen(content, {
    borderStyle: "double",
    title: args.title ? ` ${args.title} ` : undefined,
    titleAlignment: "left",
    borderColor: args.borderColor || "cyan",
    padding: { top: 0, right: 1, bottom: 0, left: 1 },
    margin: { top: 0, bottom: 0, left: 0, right: 0 },
  });
  return args.dimBorder ? synxMuted(card) : card;
}

export function themedPromptMessage(message: string): string {
  return `${synxCyan("SYNX")} ${synxPurple("»")} ${message}`;
}
