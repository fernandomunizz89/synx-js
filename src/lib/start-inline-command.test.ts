import { describe, expect, it } from "vitest";
import { mapFunctionKeyToAction, parseHumanInputCommand, parseInlineCommand, tokenizeCommandLine } from "./start-inline-command.js";

describe("start-inline-command", () => {
  it("tokenizes quoted and plain args", () => {
    expect(tokenizeCommandLine('new "Fix timer export" --type bug')).toEqual([
      "new",
      "Fix timer export",
      "--type",
      "bug",
    ]);
  });

  it("parses status command with --all", () => {
    expect(parseInlineCommand("status --all")).toEqual({ kind: "status", all: true });
  });

  it("parses new command with case-insensitive type", () => {
    expect(parseInlineCommand('new "Fix timer" --type bUg')).toEqual({
      kind: "new",
      title: "Fix timer",
      type: "Bug",
    });
  });

  it("parses new command with featute alias", () => {
    expect(parseInlineCommand('new "Add dark mode" --type Featute')).toEqual({
      kind: "new",
      title: "Add dark mode",
      type: "Feature",
    });
  });

  it("parses approve/reprove using preferred human task id", () => {
    expect(parseInlineCommand("approve", "task-123")).toEqual({
      kind: "approve",
      taskId: "task-123",
    });
    expect(parseInlineCommand('reprove --reason "Still broken"', "task-123")).toEqual({
      kind: "reprove",
      taskId: "task-123",
      reason: "Still broken",
    });
  });

  it("maps function keys to actions", () => {
    expect(mapFunctionKeyToAction({ name: "f1" })).toBe("help");
    expect(mapFunctionKeyToAction({ name: "f2" })).toBe("new");
    expect(mapFunctionKeyToAction({ name: "f3" })).toBe("pause_toggle");
    expect(mapFunctionKeyToAction({ sequence: "\u001b[21~" })).toBe("stop");
  });

  it("parses human replies to approve/reprove", () => {
    expect(parseHumanInputCommand("yes", "task-abc")).toEqual({
      kind: "approve",
      taskId: "task-abc",
    });
    expect(parseHumanInputCommand("still broken in timer", "task-abc")).toEqual({
      kind: "reprove",
      taskId: "task-abc",
      reason: "still broken in timer",
    });
  });

  it("returns useful human-mode error when no waiting task exists", () => {
    expect(parseHumanInputCommand("no")).toEqual({
      kind: "unknown",
      raw: "no",
      message: "No task waiting for human review. Use normal commands such as `new`, `status`, `approve`.",
    });
  });
});
