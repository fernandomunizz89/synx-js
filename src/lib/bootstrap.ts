import path from "node:path";
import { promises as fs } from "node:fs";
import { AI_ROOT } from "./constants.js";
import { appendText, ensureDir, exists, writeJson, writeText } from "./fs.js";
import { configDir, globalAiRoot, globalConfigPath, logsDir, promptsDir, runtimeDir, tasksDir } from "./paths.js";

export async function ensureGlobalInitialized(): Promise<void> {
  await ensureDir(globalAiRoot());
  if (!(await exists(globalConfigPath()))) {
    await writeJson(globalConfigPath(), {
      providers: {
        dispatcher: {
          type: "mock",
          model: "mock-dispatcher-v1",
          baseUrlEnv: "AI_AGENTS_OPENAI_BASE_URL",
          apiKeyEnv: "AI_AGENTS_OPENAI_API_KEY"
        },
        planner: {
          type: "mock",
          model: "mock-planner-v1",
          baseUrlEnv: "AI_AGENTS_OPENAI_BASE_URL",
          apiKeyEnv: "AI_AGENTS_OPENAI_API_KEY"
        }
      },
      defaults: { humanReviewer: "" }
    });
  }
}

export async function ensureProjectInitialized(): Promise<void> {
  const dirs = [
    path.join(process.cwd(), AI_ROOT),
    configDir(),
    promptsDir(),
    runtimeDir(),
    path.join(runtimeDir(), "locks"),
    logsDir(),
    tasksDir(),
  ];

  for (const dir of dirs) await ensureDir(dir);

  const projectConfig = path.join(configDir(), "project.json");
  if (!(await exists(projectConfig))) {
    await writeJson(projectConfig, {
      projectName: "",
      language: "",
      framework: "",
      humanReviewer: "",
      tasksDir: ".ai-agents/tasks",
      providerOverrides: {}
    });
  }

  const routingConfig = path.join(configDir(), "routing.json");
  if (!(await exists(routingConfig))) {
    await writeJson(routingConfig, {
      Feature: ["Dispatcher", "Spec Planner", "Feature Builder", "Reviewer", "QA Validator", "PR Writer"],
      Bug: ["Dispatcher", "Bug Investigator", "Feature Builder", "Reviewer", "QA Validator", "PR Writer"]
    });
  }

  const dispatcherPrompt = path.join(promptsDir(), "dispatcher.md");
  if (!(await exists(dispatcherPrompt))) await writeText(dispatcherPrompt, DISPATCHER_PROMPT.trim() + "\n");

  const plannerPrompt = path.join(promptsDir(), "spec-planner.md");
  if (!(await exists(plannerPrompt))) await writeText(plannerPrompt, PLANNER_PROMPT.trim() + "\n");

  await ensureGitignoreEntry(".ai-agents/");
}

async function ensureGitignoreEntry(entry: string): Promise<void> {
  const filePath = path.join(process.cwd(), ".gitignore");
  if (!(await exists(filePath))) {
    await fs.writeFile(filePath, `${entry}\n`, "utf8");
    return;
  }

  const current = await fs.readFile(filePath, "utf8");
  if (!current.split(/\r?\n/).includes(entry)) {
    await appendText(filePath, `\n${entry}\n`);
  }
}

const DISPATCHER_PROMPT = `
You are the Dispatcher agent in a software development pipeline.
Return ONLY valid JSON. Do not include markdown, explanations, or code fences.

You must be conservative.
Do not invent implementation details.
Do not assume a backend, database, API, component, or existing feature unless the input confirms it.
When something is unknown, record it in "unknowns".
When you make a possible interpretation, record it in "assumptions".
Mark "requiresHumanInput" as true only when the task cannot safely move forward without clarification.

Return exactly:
{
  "type": "Feature | Bug | Refactor | Research | Documentation | Mixed",
  "goal": "string",
  "context": "string",
  "knownFacts": ["string"],
  "unknowns": ["string"],
  "assumptions": ["string"],
  "constraints": ["string"],
  "requiresHumanInput": true,
  "nextAgent": "Bug Investigator | Spec Planner"
}

Routing:
- Bug -> Bug Investigator
- anything else -> Spec Planner

Input JSON:
{{INPUT_JSON}}
`;

const PLANNER_PROMPT = `
You are the Spec Planner agent in a software development pipeline.
Return ONLY valid JSON. Do not include markdown, explanations, or code fences.

You must be conservative.
Do not invent backend, database, APIs, filters, permissions, or persistence unless confirmed.
Your plan must be conditional on confirmed facts only.
When something is missing, place it in "unknowns".
Use "requiresHumanInput" only when planning cannot safely continue.

Return exactly:
{
  "technicalContext": "string",
  "knownFacts": ["string"],
  "unknowns": ["string"],
  "assumptions": ["string"],
  "requiresHumanInput": false,
  "conditionalPlan": ["string"],
  "edgeCases": ["string"],
  "risks": ["string"],
  "validationCriteria": ["string"],
  "nextAgent": "Feature Builder"
}

Input JSON:
{{INPUT_JSON}}
`;
