import path from "node:path";
import { promises as fs } from "node:fs";
import { exists, readJson, writeJson } from "./fs.js";
import { aiRoot } from "./paths.js";
import { nowIso } from "./utils.js";

export interface ProjectMemoryEntry {
  fact: string;
  /** "manual" or the taskId that produced this fact */
  source: string;
  addedAt: string;
}

export interface ProjectMemory {
  version: 1;
  /** Recurring coding patterns and conventions observed in this project */
  patterns: ProjectMemoryEntry[];
  /** Architectural decisions made across past tasks */
  decisions: ProjectMemoryEntry[];
  /** Known problems and their validated solutions */
  knownIssues: ProjectMemoryEntry[];
  updatedAt: string;
}

export function projectMemoryDir(): string {
  return path.join(aiRoot(), "memory");
}

export function projectMemoryFilePath(): string {
  return path.join(projectMemoryDir(), "project-memory.json");
}

/** Returns the persisted project memory, or null when no file exists yet. */
export async function loadProjectMemory(): Promise<ProjectMemory | null> {
  const filePath = projectMemoryFilePath();
  if (!(await exists(filePath))) return null;
  try {
    return await readJson<ProjectMemory>(filePath);
  } catch {
    return null;
  }
}

/** Persists the full memory object, refreshing `updatedAt`. */
export async function saveProjectMemory(memory: ProjectMemory): Promise<void> {
  const dir = projectMemoryDir();
  await fs.mkdir(dir, { recursive: true });
  await writeJson(projectMemoryFilePath(), { ...memory, updatedAt: nowIso() });
}

/**
 * Appends new facts to the project memory without creating duplicates.
 * Creates the memory file if it does not exist yet.
 */
export async function appendProjectMemoryFacts(
  facts: { patterns?: string[]; decisions?: string[]; knownIssues?: string[] },
  source: string,
): Promise<void> {
  const existing: ProjectMemory = (await loadProjectMemory()) ?? {
    version: 1,
    patterns: [],
    decisions: [],
    knownIssues: [],
    updatedAt: nowIso(),
  };

  const now = nowIso();
  const toEntries = (items: string[]): ProjectMemoryEntry[] =>
    items.map((fact) => ({ fact, source, addedAt: now }));

  const deduplicate = (
    list: ProjectMemoryEntry[],
    newItems: ProjectMemoryEntry[],
  ): ProjectMemoryEntry[] => {
    const seen = new Set(list.map((e) => e.fact.trim().toLowerCase()));
    const unique = newItems.filter((e) => !seen.has(e.fact.trim().toLowerCase()));
    return [...list, ...unique];
  };

  existing.patterns    = deduplicate(existing.patterns,    toEntries(facts.patterns    ?? []));
  existing.decisions   = deduplicate(existing.decisions,   toEntries(facts.decisions   ?? []));
  existing.knownIssues = deduplicate(existing.knownIssues, toEntries(facts.knownIssues ?? []));

  await saveProjectMemory(existing);
}

/**
 * Renders project memory as a markdown section suitable for LLM prompts.
 * Returns an empty string when the memory contains no entries.
 */
export function formatProjectMemoryForContext(memory: ProjectMemory): string {
  const sections: string[] = [];

  if (memory.patterns.length > 0) {
    sections.push(
      "### Established Patterns\n" +
        memory.patterns.map((e) => `- ${e.fact}`).join("\n"),
    );
  }
  if (memory.decisions.length > 0) {
    sections.push(
      "### Architectural Decisions\n" +
        memory.decisions.map((e) => `- ${e.fact}`).join("\n"),
    );
  }
  if (memory.knownIssues.length > 0) {
    sections.push(
      "### Known Issues & Solutions\n" +
        memory.knownIssues.map((e) => `- ${e.fact}`).join("\n"),
    );
  }

  return sections.length > 0
    ? `## Project Memory\n\n${sections.join("\n\n")}`
    : "";
}

/**
 * Returns flat strings suitable for inclusion in a `knownFacts` array.
 * Each string is prefixed with its category tag.
 */
export function projectMemoryFactLines(memory: ProjectMemory): string[] {
  return [
    ...memory.patterns.map((e) => `[Pattern] ${e.fact}`),
    ...memory.decisions.map((e) => `[Decision] ${e.fact}`),
    ...memory.knownIssues.map((e) => `[KnownIssue] ${e.fact}`),
  ];
}
