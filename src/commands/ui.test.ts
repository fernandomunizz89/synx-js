import { beforeEach, describe, expect, it, vi } from "vitest";
import { uiCommand } from "./ui.js";
import { ensureGlobalInitialized, ensureProjectInitialized } from "../lib/bootstrap.js";
import { startUiServer } from "../lib/ui/server.js";
import { buildWebUiHtml } from "../lib/ui/web-app.js";

vi.mock("../lib/bootstrap.js", () => ({
  ensureGlobalInitialized: vi.fn(),
  ensureProjectInitialized: vi.fn(),
}));

vi.mock("../lib/ui/server.js", () => ({
  startUiServer: vi.fn(),
}));

vi.mock("../lib/ui/web-app.js", () => ({
  buildWebUiHtml: vi.fn(),
}));

describe("ui command", () => {
  async function waitForSignal(handlers: Map<string, () => Promise<void> | void>, signal: string): Promise<(() => Promise<void> | void) | undefined> {
    for (let i = 0; i < 25; i += 1) {
      const handler = handlers.get(signal);
      if (handler) return handler;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return undefined;
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.mocked(ensureGlobalInitialized).mockResolvedValue(undefined);
    vi.mocked(ensureProjectInitialized).mockResolvedValue(undefined);
    vi.mocked(buildWebUiHtml).mockReturnValue("<!doctype html><html><body>ui</body></html>");
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("validates invalid port values", async () => {
    await expect(uiCommand.parseAsync(["--port", "70000"], { from: "user" })).rejects.toThrow("Invalid --port value");
    await expect(uiCommand.parseAsync(["--port", "0"], { from: "user" })).rejects.toThrow("Invalid --port value");
  });

  it("starts server with default mutation mode and shuts down on signal", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    vi.mocked(startUiServer).mockResolvedValue({
      host: "127.0.0.1",
      port: 4317,
      baseUrl: "http://127.0.0.1:4317",
      close,
    });

    const signalHandlers = new Map<string, () => Promise<void> | void>();
    vi.spyOn(process, "on").mockImplementation(((signal: string, handler: () => Promise<void> | void) => {
      signalHandlers.set(signal, handler);
      return process;
    }) as any);
    vi.spyOn(process, "off").mockImplementation(((signal: string) => {
      signalHandlers.delete(signal);
      return process;
    }) as any);

    const parsePromise = uiCommand.parseAsync([], { from: "user" });
    const stop = await waitForSignal(signalHandlers, "SIGINT");
    if (!stop) throw new Error("SIGINT handler was not registered.");
    await stop();
    await parsePromise;

    expect(startUiServer).toHaveBeenCalledWith({
      host: "127.0.0.1",
      port: 4317,
      html: "<!doctype html><html><body>ui</body></html>",
      enableMutations: true,
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("supports read-only mode and custom bind options", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    vi.mocked(startUiServer).mockResolvedValue({
      host: "127.0.0.1",
      port: 4318,
      baseUrl: "http://127.0.0.1:4318",
      close,
    });

    const signalHandlers = new Map<string, () => Promise<void> | void>();
    vi.spyOn(process, "on").mockImplementation(((signal: string, handler: () => Promise<void> | void) => {
      signalHandlers.set(signal, handler);
      return process;
    }) as any);
    vi.spyOn(process, "off").mockImplementation(((signal: string) => {
      signalHandlers.delete(signal);
      return process;
    }) as any);

    const parsePromise = uiCommand.parseAsync(["--read-only", "--host", "0.0.0.0", "--port", "4318"], { from: "user" });
    const stop = await waitForSignal(signalHandlers, "SIGTERM") || await waitForSignal(signalHandlers, "SIGINT");
    if (!stop) throw new Error("signal handler was not registered.");
    await stop();
    await parsePromise;

    expect(startUiServer).toHaveBeenCalledWith({
      host: "0.0.0.0",
      port: 4318,
      html: "<!doctype html><html><body>ui</body></html>",
      enableMutations: false,
    });
    expect(close).toHaveBeenCalledTimes(1);
  });
});
