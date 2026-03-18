import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadDotEnvFile } from "./load-dotenv.js";

const trackedKeys = [
  "AI_AGENTS_OPENAI_API_KEY",
  "AI_AGENTS_GOOGLE_API_KEY",
  "AI_AGENTS_LMSTUDIO_API_KEY",
  "SYNX_EXTRA",
];

describe("lib/load-dotenv", () => {
  let tempDir: string;
  let originalCwd: string;
  let originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "synx-dotenv-"));
    originalEnv = {};
    for (const key of trackedKeys) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    for (const key of trackedKeys) {
      const value = originalEnv[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("loads entries from .env and trims whitespace", () => {
    fs.writeFileSync(path.join(tempDir, ".env"), [
      "# comment",
      "AI_AGENTS_OPENAI_API_KEY= sk-secret ",
      "export AI_AGENTS_GOOGLE_API_KEY= g-goog",
      "AI_AGENTS_LMSTUDIO_API_KEY='lm token'",
      "SYNX_EXTRA=just-now",
      "",
    ].join("\n"));

    loadDotEnvFile();

    expect(process.env.AI_AGENTS_OPENAI_API_KEY).toBe("sk-secret");
    expect(process.env.AI_AGENTS_GOOGLE_API_KEY).toBe("g-goog");
    expect(process.env.AI_AGENTS_LMSTUDIO_API_KEY).toBe("lm token");
    expect(process.env.SYNX_EXTRA).toBe("just-now");
  });

  it("does not override existing values", () => {
    process.env.AI_AGENTS_GOOGLE_API_KEY = "current";
    fs.writeFileSync(path.join(tempDir, ".env"), "AI_AGENTS_GOOGLE_API_KEY=dirty\n");

    loadDotEnvFile();

    expect(process.env.AI_AGENTS_GOOGLE_API_KEY).toBe("current");
  });
});
