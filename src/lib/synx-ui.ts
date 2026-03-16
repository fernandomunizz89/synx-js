import boxen, { type Options as BoxenOptions } from "boxen";
import gradient from "gradient-string";
import stringWidth from "string-width";
import stripAnsi from "strip-ansi";
import wrapAnsi from "wrap-ansi";

const CYAN = "#00ffff";
const MAGENTA = "#ff00ff";
const PURPLE_SOFT = "#c89bff";
const GREEN = "#26ff8c";
const RED = "#ff4d4d";
const YELLOW = "#ffb347";
const RESET = "\x1b[0m";

function terminalWidth(): number {
  return Math.max(56, process.stdout.columns || 120);
}

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

function centerAnsiLine(line: string, width: number): string {
  const visible = stringWidth(stripAnsi(line));
  const left = Math.max(0, Math.floor((width - visible) / 2));
  return `${" ".repeat(left)}${line}`;
}

function wrapLines(lines: string[], width: number): string[] {
  const wrapped: string[] = [];
  for (const line of lines) {
    const safe = wrapAnsi(line, Math.max(10, width), { hard: false, trim: false });
    wrapped.push(...safe.split("\n"));
  }
  return wrapped;
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

export function synxMagenta(text: string): string {
  return paintHex(MAGENTA, text);
}

export function synxPurple(text: string): string {
  return paintHex(PURPLE_SOFT, text);
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
  return `${synxCyan("[SYNX]")} ${synxMagenta("➜")} ${synxCyan("[Dispatcher]")} ${synxMagenta("➜")} ${synxCyan("[Planner]")}`;
}

export type SynxLogoStyle = "auto" | "large" | "compact" | "micro";

export function renderSynxLogo(width = terminalWidth(), style: SynxLogoStyle = "auto"): string {
  const logoLarge = [
    "███████╗██╗   ██╗███╗   ██╗██╗  ██╗",
    "██╔════╝╚██╗ ██╔╝████╗  ██║╚██╗██╔╝",
    "███████╗ ╚████╔╝ ██╔██╗ ██║ ╚███╔╝ ",
    "╚════██║  ╚██╔╝  ██║╚██╗██║ ██╔██╗ ",
    "███████║   ██║   ██║ ╚████║██╔╝ ██╗",
    "╚══════╝   ╚═╝   ╚═╝  ╚═══╝╚═╝  ╚═╝",
  ];
  const logoCompact = [
    "███╗ ███╗",
    "╚██║██╔╝",
    " ████╔╝ ",
    " ██╔██╗ ",
    "██╔╝╚██╗",
    "╚═╝  ╚═╝",
  ];
  const logoMicro = ["SYNX"];

  const largestWidth = Math.max(...logoLarge.map((line) => stringWidth(line)));
  const compactWidth = Math.max(...logoCompact.map((line) => stringWidth(line)));

  const chosen = style === "large"
    ? logoLarge
    : style === "compact"
      ? logoCompact
      : style === "micro"
        ? logoMicro
        : width >= (largestWidth + 4)
          ? logoLarge
          : width >= (compactWidth + 4)
            ? logoCompact
            : logoMicro;

  const gradientLogo = chosen.map((line) => gradient([CYAN, MAGENTA])(line));
  const taglineText = width < 40 ? "[ SYNX v5.0 ]" : "[ SYNTHETIC AGENT ORCHESTRATOR v5.0 ]";
  const tagline = synxPurple(taglineText);
  return [...gradientLogo.map((line) => centerAnsiLine(line, width)), centerAnsiLine(tagline, width)].join("\n");
}

export function renderSynxPanel(args: {
  title?: string;
  lines: string[];
  borderColor?: BoxenOptions["borderColor"];
  width?: number;
}): string {
  const fullWidth = Math.max(28, args.width || terminalWidth());
  const innerWidth = Math.max(16, fullWidth - 4);
  const wrapped = wrapLines(args.lines, innerWidth);
  return boxen(wrapped.join("\n"), {
    borderStyle: "single",
    title: args.title ? ` ${args.title} ` : undefined,
    titleAlignment: "left",
    borderColor: args.borderColor || "cyan",
    padding: { top: 0, right: 1, bottom: 0, left: 1 },
    margin: 0,
    width: fullWidth,
  });
}

export function renderHeaderContextLine(message: string, atIso = new Date().toISOString()): string {
  return synxMuted(formatSynxStreamLog(message, "SYNX", atIso));
}

export function themedPromptMessage(message: string): string {
  return `${synxCyan("SYNX")} ${synxMagenta("»")} ${message}`;
}
