import { describe, expect, it, vi, beforeEach } from "vitest";
import { setupKeypressHandler } from "./interaction-handler.js";
import { mapFunctionKeyToAction, parseHumanInputCommand, parseInlineCommand } from "../start-inline-command.js";

vi.mock("../start-inline-command.js", () => ({
  mapFunctionKeyToAction: vi.fn(),
  parseHumanInputCommand: vi.fn(),
  parseInlineCommand: vi.fn(),
}));

describe("lib/start/interaction-handler", () => {
  let state: any;
  let queueCommand: any;
  let requestStop: any;
  let pushEvent: any;
  let render: any;

  beforeEach(() => {
    state = {
      paused: false,
      logViewMode: "console",
      interactionMode: "command",
      inputBuffer: "",
      metas: [],
    };
    queueCommand = vi.fn();
    requestStop = vi.fn();
    pushEvent = vi.fn();
    render = vi.fn();
    vi.mocked(mapFunctionKeyToAction).mockReturnValue(undefined as any);
    vi.mocked(parseInlineCommand).mockReturnValue(undefined as any);
    vi.mocked(parseHumanInputCommand).mockReturnValue(undefined as any);
    vi.clearAllMocks();
  });

  it("handles Ctrl+C to request stop", () => {
    const handler = setupKeypressHandler({ state, queueCommand, requestStop, pushEvent, render });
    handler("", { ctrl: true, name: "c" });
    expect(requestStop).toHaveBeenCalledWith("SIGINT");
  });

  it("handles help key '?'", () => {
    const handler = setupKeypressHandler({ state, queueCommand, requestStop, pushEvent, render });
    handler("?", { name: "unknown" }); // Just '?' char
    expect(queueCommand).toHaveBeenCalledWith({ kind: "help" });
  });

  it("handles F2 for new task template", () => {
    vi.mocked(mapFunctionKeyToAction).mockReturnValue("new");
    const handler = setupKeypressHandler({ state, queueCommand, requestStop, pushEvent, render });
    handler("", { name: "f2" });
    expect(state.interactionMode).toBe("command");
    expect(state.inputBuffer).toContain("new");
    expect(render).toHaveBeenCalled();
  });

  it("handles F3 for pause toggle", () => {
    vi.mocked(mapFunctionKeyToAction).mockReturnValue("pause_toggle");
    const handler = setupKeypressHandler({ state, queueCommand, requestStop, pushEvent, render });
    handler("", { name: "f3" });
    expect(state.paused).toBe(true);
    expect(pushEvent).toHaveBeenCalledWith(expect.stringContaining("Engine paused"));
  });

  it("accumulates characters in input buffer", () => {
    const handler = setupKeypressHandler({ state, queueCommand, requestStop, pushEvent, render });
    handler("a", { name: "a" });
    handler("b", { name: "b" });
    expect(state.inputBuffer).toBe("ab");
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("handles backspace to remove last character", () => {
    state.inputBuffer = "hello";
    const handler = setupKeypressHandler({ state, queueCommand, requestStop, pushEvent, render });
    handler("", { name: "backspace" });
    expect(state.inputBuffer).toBe("hell");
  });

  it("handles enter to submit command", () => {
    state.inputBuffer = "approve";
    vi.mocked(parseInlineCommand).mockReturnValue({ kind: "approve" } as any);
    const handler = setupKeypressHandler({ state, queueCommand, requestStop, pushEvent, render });
    handler("", { name: "return" });
    expect(parseInlineCommand).toHaveBeenCalledWith("approve", undefined);
    expect(queueCommand).toHaveBeenCalledWith({ kind: "approve" });
    expect(state.inputBuffer).toBe("");
  });
});
