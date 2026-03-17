import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { 
  normalizeInputPath, 
  isBlockedPath, 
  extractKeywords, 
  scoreText, 
  extensionPriority,
  sortByScore,
  sanitizeForContext
} from "./workspace-scanner.js";

describe("workspace-scanner", () => {
  describe("normalizeInputPath", () => {
    it("should normalize paths", () => {
      expect(normalizeInputPath("./src/file.ts")).toBe("src/file.ts");
      expect(normalizeInputPath("src\\file.ts")).toBe("src/file.ts");
      expect(normalizeInputPath("  src/file.ts  ")).toBe("src/file.ts");
    });
  });

  describe("isBlockedPath", () => {
    it("should identify blocked paths", () => {
      expect(isBlockedPath(".git")).toBe(true);
      expect(isBlockedPath(".git/config")).toBe(true);
      expect(isBlockedPath(".ai-agents/task.json")).toBe(true);
      expect(isBlockedPath("src/index.ts")).toBe(false);
    });
  });

  describe("extractKeywords", () => {
    it("should extract keywords and filter stopwords", () => {
      const text = "The quick brown fox jumps over the lazy dog and a task needs to be fixed.";
      const keywords = extractKeywords(text);
      expect(keywords).toContain("quick");
      expect(keywords).toContain("brown");
      expect(keywords).not.toContain("the");
      expect(keywords).not.toContain("task");
    });
  });

  describe("scoreText", () => {
    it("should score text based on keywords", () => {
      const keywords = ["ai", "agent"];
      expect(scoreText("an ai agent is here", keywords)).toBe(2);
      expect(scoreText("nothing match", keywords)).toBe(0);
    });
  });

  describe("extensionPriority", () => {
    it("should return priority based on extension", () => {
      expect(extensionPriority("style.css")).toBe(5);
      expect(extensionPriority("component.tsx")).toBe(4);
      expect(extensionPriority("logic.ts")).toBe(3);
      expect(extensionPriority("index.html")).toBe(2);
      expect(extensionPriority("README.md")).toBe(1);
    });
  });

  describe("sortByScore", () => {
    it("should sort paths by priority (related, then score, then extension)", () => {
      const paths = ["a.ts", "b.css", "c.ts"];
      const keywords = ["a"];
      const related = new Set(["c.ts"]);
      const sorted = sortByScore(paths, keywords, related);
      
      expect(sorted[0]).toBe("c.ts"); // related
      expect(sorted[1]).toBe("a.ts"); // score from keywords "a"
      expect(sorted[2]).toBe("b.css"); // no score, but css > ts? Wait, extensionPriority favors css(5) over ts(3).
      // Let's re-verify logic: if scores are equal, extensionPriority wins.
    });
  });

  describe("sanitizeForContext", () => {
    it("should truncate long content", () => {
      const content = "a".repeat(10);
      expect(sanitizeForContext(content, 5)).toContain("truncated");
      expect(sanitizeForContext(content, 20)).toBe(content);
    });
  });
});
