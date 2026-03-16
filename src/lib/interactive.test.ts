import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  selectOption,
  selectMany,
  promptRequiredText,
  promptTextWithDefault,
  confirmAction,
  canPromptInteractively,
} from "./interactive.js";
import * as prompts from "@inquirer/prompts";

vi.mock("@inquirer/prompts", () => ({
  checkbox: vi.fn(),
  confirm: vi.fn(),
  input: vi.fn(),
  select: vi.fn(),
}));

describe("interactive prompts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Simulate interactive terminal by default
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
  });

  describe("canPromptInteractively", () => {
    it("returns true when TTY is available", () => {
      expect(canPromptInteractively()).toBe(true);
    });

    it("returns false when TTY is absent", () => {
      Object.defineProperty(process.stdin, "isTTY", { value: false });
      expect(canPromptInteractively()).toBe(false);
    });
  });

  describe("selectOption", () => {
    it("returns fallback value if not interactive", async () => {
      Object.defineProperty(process.stdin, "isTTY", { value: false });
      const result = await selectOption("Choose:", [{ value: "A", label: "A" }], "B");
      expect(result).toBe("B");
    });

    it("throws if not interactive and no fallback", async () => {
      Object.defineProperty(process.stdin, "isTTY", { value: false });
      await expect(selectOption("Choose:", [{ value: "A", label: "A" }])).rejects.toThrow("requires an interactive terminal");
    });

    it("uses inquirer select when interactive", async () => {
      vi.mocked(prompts.select).mockResolvedValue("A" as never);
      const result = await selectOption("Choose:", [{ value: "A", label: "A" }]);
      expect(result).toBe("A");
      expect(prompts.select).toHaveBeenCalled();
    });
  });

  describe("selectMany", () => {
    it("returns fallback values if not interactive", async () => {
      Object.defineProperty(process.stdin, "isTTY", { value: false });
      const result = await selectMany("Choose:", [{ value: "A", label: "A" }], ["C"]);
      expect(result).toEqual(["C"]);
    });

    it("uses inquirer checkbox when interactive", async () => {
      vi.mocked(prompts.checkbox).mockResolvedValue(["A"] as never);
      const result = await selectMany("Choose:", [{ value: "A", label: "A" }]);
      expect(result).toEqual(["A"]);
      expect(prompts.checkbox).toHaveBeenCalled();
    });
  });

  describe("promptRequiredText", () => {
    it("returns fallback if not interactive", async () => {
      Object.defineProperty(process.stdin, "isTTY", { value: false });
      const result = await promptRequiredText("Enter:", "default-val");
      expect(result).toBe("default-val");
    });

    it("throws if not interactive and no fallback", async () => {
      Object.defineProperty(process.stdin, "isTTY", { value: false });
      await expect(promptRequiredText("Enter:")).rejects.toThrow("requires an interactive terminal");
    });

    it("uses inquirer input and forces a value", async () => {
      // simulate first input empty, second valid
      vi.mocked(prompts.input).mockResolvedValueOnce("  " as never).mockResolvedValueOnce("valid" as never);
      const result = await promptRequiredText("Enter:");
      expect(result).toBe("valid");
      expect(prompts.input).toHaveBeenCalledTimes(2);
    });
  });

  describe("promptTextWithDefault", () => {
    it("returns fallback if not interactive", async () => {
      Object.defineProperty(process.stdin, "isTTY", { value: false });
      const result = await promptTextWithDefault("Enter:", "def", "fall");
      expect(result).toBe("fall");
    });

    it("returns default if not interactive and no fallback", async () => {
      Object.defineProperty(process.stdin, "isTTY", { value: false });
      const result = await promptTextWithDefault("Enter:", "def");
      expect(result).toBe("def");
    });

    it("uses inquirer input and returns the entered value", async () => {
      vi.mocked(prompts.input).mockResolvedValue("entered" as never);
      const result = await promptTextWithDefault("Enter:", "def");
      expect(result).toBe("entered");
    });

    it("uses inquirer input and returns default if answer is empty", async () => {
      vi.mocked(prompts.input).mockResolvedValue("   " as never);
      const result = await promptTextWithDefault("Enter:", "def");
      expect(result).toBe("def");
    });
  });

  describe("confirmAction", () => {
    it("returns defaultValue if not interactive", async () => {
      Object.defineProperty(process.stdin, "isTTY", { value: false });
      const result = await confirmAction("Are you sure?", true);
      expect(result).toBe(true);
    });

    it("uses inquirer confirm when interactive", async () => {
      vi.mocked(prompts.confirm).mockResolvedValue(true as never);
      const result = await confirmAction("Are you sure?");
      expect(result).toBe(true);
      expect(prompts.confirm).toHaveBeenCalled();
    });
  });
});
