import { describe, expect, it, vi, beforeEach } from "vitest";
import { findRepoRoot } from "./repo.js";
import { existsSync } from "node:fs";
import path from "node:path";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

describe("lib/repo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("finds root via .git directory", () => {
    vi.mocked(existsSync).mockImplementation((p: any) => p === "/home/user/project/.git");
    const start = "/home/user/project/src/lib";
    const root = findRepoRoot(start);
    expect(root).toBe("/home/user/project");
  });

  it("finds root via .ai-agents file", () => {
    vi.mocked(existsSync).mockImplementation((p: any) => p === "/home/user/project/.ai-agents");
    const start = "/home/user/project/src";
    const root = findRepoRoot(start);
    expect(root).toBe("/home/user/project");
  });

  it("finds root via package.json", () => {
    vi.mocked(existsSync).mockImplementation((p: any) => p === "/home/user/project/package.json");
    const start = "/home/user/project/src";
    const root = findRepoRoot(start);
    expect(root).toBe("/home/user/project");
  });

  it("stops at filesystem root and returns startDir if nothing found", () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const start = "/home/user/random";
    const root = findRepoRoot(start);
    // On Unix, path.dirname("/") is "/".
    // The loop will eventually hit parent === current and return path.resolve(startDir).
    expect(root).toBe(path.resolve(start));
  });
});
