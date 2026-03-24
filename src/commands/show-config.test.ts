import { describe, expect, it, vi, beforeEach } from "vitest";
import { showConfigCommand } from "./show-config.js";
import * as config from "../lib/config.js";

vi.mock("../lib/config.js", () => ({
  loadGlobalConfig: vi.fn(),
  loadLocalProjectConfig: vi.fn(),
  loadResolvedProjectConfig: vi.fn(),
}));

describe("commands/show-config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("prints global, local and resolved config", async () => {
    vi.mocked(config.loadGlobalConfig).mockResolvedValue({ global: true } as any);
    vi.mocked(config.loadLocalProjectConfig).mockResolvedValue({ local: true } as any);
    vi.mocked(config.loadResolvedProjectConfig).mockResolvedValue({ resolved: true } as any);

    await showConfigCommand.parseAsync(["node", "show-config"]);

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Global config"));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"global": true'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Local project config"));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"local": true'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Resolved config"));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"resolved": true'));
  });
});
