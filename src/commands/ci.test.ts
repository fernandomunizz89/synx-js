import { describe, it, expect } from "vitest";
import { ciCommand } from "./ci.js";
import { Command } from "commander";

describe("ciCommand", () => {
  it("is a Command instance named 'ci'", () => {
    expect(ciCommand).toBeInstanceOf(Command);
    expect(ciCommand.name()).toBe("ci");
  });

  it("has expected options: --timeout, --dry-run, --fail-fast", () => {
    const optionNames = ciCommand.options.map((o) => o.long);
    expect(optionNames).toContain("--timeout");
    expect(optionNames).toContain("--dry-run");
    expect(optionNames).toContain("--fail-fast");
  });

  it("description includes CI/CD", () => {
    expect(ciCommand.description()).toMatch(/CI\/CD/i);
  });
});
