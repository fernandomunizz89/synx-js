import type { TaskType } from "./types.js";

export type InlineCommand =
  | { kind: "help" }
  | { kind: "stop" }
  | { kind: "status"; all: boolean }
  | { kind: "new"; title: string; type: TaskType }
  | { kind: "approve"; taskId: string }
  | { kind: "reprove"; taskId: string; reason: string }
  | { kind: "unknown"; raw: string; message: string };

export type HotkeyAction = "help" | "new" | "pause_toggle" | "toggle_log_view" | "stop" | "none";

export function tokenizeCommandLine(input: string): string[] {
  const out: string[] = [];
  const src = input.trim();
  if (!src) return out;

  let current = "";
  let quote: "'" | '"' | "" = "";
  let escaped = false;

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];

    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      escaped = true;
      continue;
    }

    if (quote) {
      if (ch === quote) {
        quote = "";
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }

    if (/\s/.test(ch)) {
      if (current) {
        out.push(current);
        current = "";
      }
      continue;
    }

    current += ch;
  }

  if (current) out.push(current);
  return out;
}

function parseTaskType(value: string | undefined): TaskType | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "feature" || normalized === "feat" || normalized === "featute") return "Feature";
  if (normalized === "bug") return "Bug";
  if (normalized === "refactor" || normalized === "refactoring") return "Refactor";
  if (normalized === "research") return "Research";
  if (normalized === "documentation" || normalized === "docs" || normalized === "doc") return "Documentation";
  if (normalized === "mixed") return "Mixed";
  return null;
}

function extractOption(tokens: string[], name: string): string {
  const index = tokens.findIndex((token) => token === name);
  if (index < 0) return "";
  return String(tokens[index + 1] || "").trim();
}

function normalizeTaskId(taskId: string): string {
  return taskId.trim();
}

export function parseInlineCommand(input: string, preferredHumanTaskId = ""): InlineCommand {
  const tokens = tokenizeCommandLine(input);
  if (!tokens.length) {
    return { kind: "unknown", raw: input, message: "Empty command." };
  }

  const [rawCommand, ...tail] = tokens;
  const command = rawCommand.toLowerCase();

  if (command === "help") return { kind: "help" };
  if (command === "stop" || command === "exit" || command === "quit") return { kind: "stop" };

  if (command === "status") {
    return { kind: "status", all: tail.includes("--all") };
  }

  if (command === "new") {
    const typeRaw = extractOption(tail, "--type");
    const type = parseTaskType(typeRaw || "") || "Feature";

    const titleParts: string[] = [];
    for (let i = 0; i < tail.length; i += 1) {
      const token = tail[i];
      if (token.startsWith("--")) {
        i += 1;
        continue;
      }
      titleParts.push(token);
    }

    const title = titleParts.join(" ").trim();
    if (!title) {
      return {
        kind: "unknown",
        raw: input,
        message: "Missing task title. Example: new \"Fix timer\" --type Bug",
      };
    }

    return {
      kind: "new",
      title,
      type,
    };
  }

  if (command === "approve") {
    const taskId = normalizeTaskId(extractOption(tail, "--task-id") || preferredHumanTaskId);
    if (!taskId) {
      return {
        kind: "unknown",
        raw: input,
        message: "Missing task id for approve. Example: approve --task-id task-...",
      };
    }
    return {
      kind: "approve",
      taskId,
    };
  }

  if (command === "reprove") {
    const taskId = normalizeTaskId(extractOption(tail, "--task-id") || preferredHumanTaskId);
    const reason = extractOption(tail, "--reason");
    if (!taskId) {
      return {
        kind: "unknown",
        raw: input,
        message: "Missing task id for reprove. Example: reprove --task-id task-... --reason \"...\"",
      };
    }
    if (!reason) {
      return {
        kind: "unknown",
        raw: input,
        message: "Missing --reason for reprove.",
      };
    }
    return {
      kind: "reprove",
      taskId,
      reason,
    };
  }

  return {
    kind: "unknown",
    raw: input,
    message: `Unknown command: ${rawCommand}`,
  };
}

export function parseHumanInputCommand(input: string, preferredHumanTaskId = ""): InlineCommand {
  const trimmed = input.trim();
  if (!trimmed) {
    return {
      kind: "unknown",
      raw: input,
      message: "Human input is empty.",
    };
  }

  const explicit = parseInlineCommand(trimmed, preferredHumanTaskId);
  if (explicit.kind !== "unknown") return explicit;

  const normalized = trimmed.toLowerCase();
  if (/^(yes|y|approve|approved|ok)\b/.test(normalized)) {
    if (!preferredHumanTaskId) {
      return {
        kind: "unknown",
        raw: input,
        message: "No task waiting for human review right now.",
      };
    }
    return { kind: "approve", taskId: preferredHumanTaskId };
  }

  if (!preferredHumanTaskId) {
    return {
      kind: "unknown",
      raw: input,
      message: "No task waiting for human review. Use normal commands such as `new`, `status`, `approve`.",
    };
  }

  const reason = trimmed.replace(/^(no|n|reject|reprove)\b[:\s-]*/i, "").trim() || "Human requested changes.";
  return {
    kind: "reprove",
    taskId: preferredHumanTaskId,
    reason,
  };
}

export function mapFunctionKeyToAction(key: {
  name?: string;
  sequence?: string;
}): HotkeyAction {
  const name = String(key.name || "").toLowerCase();
  if (name === "f1") return "help";
  if (name === "f2") return "new";
  if (name === "f3") return "pause_toggle";
  if (name === "f4") return "toggle_log_view";
  if (name === "f10") return "stop";

  const sequence = String(key.sequence || "");
  if (sequence === "\u001bOP") return "help";
  if (sequence === "\u001bOQ") return "new";
  if (sequence === "\u001bOR") return "pause_toggle";
  if (sequence === "\u001bOS") return "toggle_log_view";
  if (sequence === "\u001b[21~" || sequence === "\u001b[10~") return "stop";
  return "none";
}
