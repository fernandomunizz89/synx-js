import path from "node:path";
import { promises as fs } from "node:fs";
import { exists, readJson } from "./fs.js";
import { agentsDir } from "./paths.js";
import { agentDefinitionSchema } from "./schema.js";
import type { AgentDefinition } from "./types.js";

export async function loadAgentDefinition(agentId: string): Promise<AgentDefinition> {
  const filePath = path.join(agentsDir(), `${agentId}.json`);
  if (!(await exists(filePath))) {
    throw new Error(`Agent definition not found: ${agentId}`);
  }
  const raw = await readJson<unknown>(filePath);
  return agentDefinitionSchema.parse(raw);
}

export async function loadAgentDefinitions(): Promise<AgentDefinition[]> {
  const dir = agentsDir();
  if (!(await exists(dir))) return [];

  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }

  const jsonFiles = entries.filter((f) => f.endsWith(".json"));
  const results: AgentDefinition[] = [];

  for (const file of jsonFiles) {
    try {
      const raw = await readJson<unknown>(path.join(dir, file));
      results.push(agentDefinitionSchema.parse(raw));
    } catch {
      // skip invalid definitions
    }
  }
  return results;
}
