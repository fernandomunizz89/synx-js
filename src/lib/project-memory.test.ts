import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const originalCwd = process.cwd();

describe("lib/project-memory", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "synx-pm-test-"));
    // Minimal repo structure so aiRoot() resolves correctly
    await fs.mkdir(path.join(tmpDir, ".ai-agents", "memory"), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "synx-pm-test" }),
      "utf8",
    );
    process.chdir(tmpDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns null when no memory file exists", async () => {
    const { loadProjectMemory } = await import("./project-memory.js");
    const result = await loadProjectMemory();
    expect(result).toBeNull();
  });

  it("saves and loads project memory round-trip", async () => {
    const { saveProjectMemory, loadProjectMemory } = await import("./project-memory.js");

    await saveProjectMemory({
      version: 1,
      patterns: [{ fact: "Use zod for validation", source: "manual", addedAt: new Date().toISOString() }],
      decisions: [],
      knownIssues: [],
      updatedAt: new Date().toISOString(),
    });

    const loaded = await loadProjectMemory();
    expect(loaded).not.toBeNull();
    expect(loaded!.patterns).toHaveLength(1);
    expect(loaded!.patterns[0].fact).toBe("Use zod for validation");
  });

  it("appendProjectMemoryFacts creates file on first call", async () => {
    const { appendProjectMemoryFacts, loadProjectMemory } = await import("./project-memory.js");

    await appendProjectMemoryFacts(
      { patterns: ["Always use TypeScript strict mode"] },
      "task-001",
    );

    const loaded = await loadProjectMemory();
    expect(loaded).not.toBeNull();
    expect(loaded!.patterns).toHaveLength(1);
    expect(loaded!.patterns[0].source).toBe("task-001");
  });

  it("appendProjectMemoryFacts deduplicates facts case-insensitively", async () => {
    const { appendProjectMemoryFacts, loadProjectMemory } = await import("./project-memory.js");

    await appendProjectMemoryFacts({ patterns: ["Use zod for validation"] }, "t1");
    await appendProjectMemoryFacts({ patterns: ["use zod for validation"] }, "t2"); // duplicate
    await appendProjectMemoryFacts({ patterns: ["Use Prisma as ORM"] }, "t3");

    const loaded = await loadProjectMemory();
    expect(loaded!.patterns).toHaveLength(2);
  });

  it("appendProjectMemoryFacts accumulates all three categories", async () => {
    const { appendProjectMemoryFacts, loadProjectMemory } = await import("./project-memory.js");

    await appendProjectMemoryFacts(
      {
        patterns: ["Use zod"],
        decisions: ["Chose Fastify over Express"],
        knownIssues: ["Prisma migration must run before start"],
      },
      "task-abc",
    );

    const loaded = await loadProjectMemory();
    expect(loaded!.patterns).toHaveLength(1);
    expect(loaded!.decisions).toHaveLength(1);
    expect(loaded!.knownIssues).toHaveLength(1);
  });

  it("formatProjectMemoryForContext returns empty string for empty memory", async () => {
    const { formatProjectMemoryForContext } = await import("./project-memory.js");
    const result = formatProjectMemoryForContext({
      version: 1,
      patterns: [],
      decisions: [],
      knownIssues: [],
      updatedAt: new Date().toISOString(),
    });
    expect(result).toBe("");
  });

  it("formatProjectMemoryForContext renders all populated sections", async () => {
    const { formatProjectMemoryForContext } = await import("./project-memory.js");
    const result = formatProjectMemoryForContext({
      version: 1,
      patterns: [{ fact: "Use zod", source: "manual", addedAt: "" }],
      decisions: [{ fact: "Chose Fastify", source: "manual", addedAt: "" }],
      knownIssues: [{ fact: "Run migrations first", source: "manual", addedAt: "" }],
      updatedAt: "",
    });
    expect(result).toContain("## Project Memory");
    expect(result).toContain("### Established Patterns");
    expect(result).toContain("Use zod");
    expect(result).toContain("### Architectural Decisions");
    expect(result).toContain("Chose Fastify");
    expect(result).toContain("### Known Issues & Solutions");
    expect(result).toContain("Run migrations first");
  });

  it("projectMemoryFactLines returns prefixed strings for knownFacts injection", async () => {
    const { projectMemoryFactLines } = await import("./project-memory.js");
    const lines = projectMemoryFactLines({
      version: 1,
      patterns: [{ fact: "Use zod", source: "m", addedAt: "" }],
      decisions: [{ fact: "Chose Fastify", source: "m", addedAt: "" }],
      knownIssues: [{ fact: "Run migrations", source: "m", addedAt: "" }],
      updatedAt: "",
    });
    expect(lines).toEqual([
      "[Pattern] Use zod",
      "[Decision] Chose Fastify",
      "[KnownIssue] Run migrations",
    ]);
  });
});
