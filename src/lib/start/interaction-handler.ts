import readline from "node:readline";
import { mapFunctionKeyToAction, parseHumanInputCommand, parseInlineCommand, type InlineCommand } from "../start-inline-command.js";
import type { TaskMeta } from "../types.js";

interface InteractionState {
  paused: boolean;
  logViewMode: "console" | "event_stream";
  interactionMode: "command" | "human_input";
  inputBuffer: string;
  preferredHumanTaskId: string;
  metas: TaskMeta[];
}

export function setupKeypressHandler(args: {
  state: InteractionState;
  queueCommand: (command: InlineCommand) => void;
  requestStop: (signal: NodeJS.Signals) => void;
  pushEvent: (message: string, level?: "info" | "critical") => void;
  render: () => void;
}) {
  const { state, queueCommand, requestStop, pushEvent, render } = args;

  return (str: string, key: { name?: string; sequence?: string; ctrl?: boolean; meta?: boolean }): void => {
    if (key.ctrl && key.name === "c") {
      requestStop("SIGINT");
      return;
    }

    if (str === "?" && !key.ctrl && !key.meta && state.interactionMode === "command" && state.inputBuffer.length === 0) {
      queueCommand({ kind: "help" });
      return;
    }

    const action = mapFunctionKeyToAction(key);
    if (action === "help") {
      queueCommand({ kind: "help" });
      return;
    }
    if (action === "new") {
      state.interactionMode = "command";
      state.inputBuffer = "new \"\" --type Feature";
      pushEvent("F2 loaded new-task template in prompt.");
      render();
      return;
    }
    if (action === "pause_toggle") {
      state.paused = !state.paused;
      pushEvent(state.paused ? "Engine paused (F3)." : "Engine resumed (F3).");
      render();
      return;
    }
    if (action === "toggle_log_view") {
      state.logViewMode = state.logViewMode === "console" ? "event_stream" : "console";
      pushEvent(state.logViewMode === "console" ? "View switched to CONSOLE." : "View switched to EVENT STREAM.");
      render();
      return;
    }
    if (action === "stop") {
      requestStop("SIGTERM");
      return;
    }

    if (key.name === "return" || key.name === "enter") {
      const submitted = state.inputBuffer.trim();
      state.inputBuffer = "";
      if (!submitted) {
        render();
        return;
      }

      const command = state.interactionMode === "human_input"
        ? parseHumanInputCommand(submitted, state.preferredHumanTaskId)
        : parseInlineCommand(submitted, state.preferredHumanTaskId);
      queueCommand(command);
      render();
      return;
    }

    if (key.name === "backspace" || key.name === "delete") {
      state.inputBuffer = state.inputBuffer.slice(0, -1);
      render();
      return;
    }

    if (key.ctrl || key.meta) return;
    if (!str) return;
    if (/\r|\n/.test(str)) return;
    if (/^[\x20-\x7E]$/.test(str)) {
      state.inputBuffer += str;
      if (state.inputBuffer.length > 320) {
        state.inputBuffer = state.inputBuffer.slice(0, 320);
      }
      render();
    }
  };
}
