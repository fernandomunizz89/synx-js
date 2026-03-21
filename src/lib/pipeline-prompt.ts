// Resolves the prompt for a given step agent

import path from "node:path";
import { loadAgentDefinition } from "./agent-registry.js";
import { loadPromptFile } from "./config.js";
import { exists, readText } from "./fs.js";
import { agentsDir, repoRoot } from "./paths.js";

const KNOWN_AGENT_PROMPTS: Record<string, string> = {
  "Dispatcher": "dispatcher.md",
  "Synx Front Expert": "synx-front-expert.md",
  "Synx Mobile Expert": "synx-mobile-expert.md",
  "Synx Back Expert": "synx-back-expert.md",
  "Synx QA Engineer": "synx-qa-engineer.md",
  "Synx SEO Specialist": "synx-seo-specialist.md",
};

export async function resolveStepPrompt(stepAgent: string): Promise<string> {
  // Known built-in agent
  if (KNOWN_AGENT_PROMPTS[stepAgent]) {
    return loadPromptFile(KNOWN_AGENT_PROMPTS[stepAgent]);
  }

  // Custom agent (by ID)
  const agentFile = path.join(agentsDir(), `${stepAgent}.json`);
  if (await exists(agentFile)) {
    const def = await loadAgentDefinition(stepAgent);
    const promptPath = path.resolve(repoRoot(), def.prompt);
    return readText(promptPath);
  }

  throw new Error(`Cannot resolve prompt for step agent "${stepAgent}". Not a known agent or registered custom agent.`);
}
