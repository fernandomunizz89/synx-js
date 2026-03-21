import path from "node:path";
import { promises as fs } from "node:fs";
import { exists, readJson } from "./fs.js";
import { pipelinesDir } from "./paths.js";
import { pipelineDefinitionSchema } from "./schema.js";
import type { PipelineDefinition } from "./types.js";

export async function loadPipelineDefinition(pipelineId: string): Promise<PipelineDefinition> {
  const filePath = path.join(pipelinesDir(), `${pipelineId}.json`);
  if (!(await exists(filePath))) {
    throw new Error(`Pipeline definition not found: ${pipelineId}`);
  }
  const raw = await readJson<unknown>(filePath);
  return pipelineDefinitionSchema.parse(raw);
}

export async function loadPipelineDefinitions(): Promise<PipelineDefinition[]> {
  const dir = pipelinesDir();
  if (!(await exists(dir))) return [];

  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }

  const jsonFiles = entries.filter((f) => f.endsWith(".json"));
  const results: PipelineDefinition[] = [];

  for (const file of jsonFiles) {
    try {
      const raw = await readJson<unknown>(path.join(dir, file));
      results.push(pipelineDefinitionSchema.parse(raw));
    } catch {
      // skip invalid definitions
    }
  }
  return results;
}
