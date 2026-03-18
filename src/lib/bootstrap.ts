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
      Feature: ["Dispatcher", "Synx Front Expert"],
      Bug: ["Dispatcher", "Synx QA Engineer"]
    });
  }

  const dispatcherPrompt = path.join(promptsDir(), "dispatcher.md");
  if (!(await exists(dispatcherPrompt))) await writeText(dispatcherPrompt, DISPATCHER_PROMPT.trim() + "\n");

  const researcherPrompt = path.join(promptsDir(), "researcher.md");
  if (!(await exists(researcherPrompt))) await writeText(researcherPrompt, RESEARCHER_PROMPT.trim() + "\n");

  const qaPrompt = path.join(promptsDir(), "qa-validator.md");
  if (!(await exists(qaPrompt))) await writeText(qaPrompt, QA_PROMPT.trim() + "\n");

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
You are the Dispatcher agent. Act with ownership and technical authority.
Return ONLY valid JSON.

You must be evidence-driven and decisive.
Verify existence of systems/features; if unconfirmed, prioritize finding evidence over stalling.
Distinguish confirmed facts from solvable unknowns.
Escalate to human review ("requiresHumanInput": true) ONLY when progress is logically impossible.

Return exactly:
{
  "thoughtProcess": "string (Chain-of-thought analysis of the input and routing logic)",
  "type": "Feature | Bug | Refactor | Research | Documentation | Mixed",
  "goal": "string",
  "context": "string",
  "knownFacts": ["string"],
  "unknowns": ["string"],
  "assumptions": ["string"],
  "constraints": ["string"],
  "requiresHumanInput": boolean,
  "nextAgent": "Spec Planner"
}

Routing:
- anything else -> Spec Planner

Input JSON:
{{INPUT_JSON}}
`;

const RESEARCHER_PROMPT = `
You are the Researcher agent. Act as a Technical Analyst.
Return ONLY valid JSON.

Synthesize technical evidence into a decisive recommendation.
Prefer official documentation and high-signal engineering sources.
Avoid speculation; if evidence is weak, prioritize identifying the missing link.

Return exactly:
{
  "thoughtProcess": "string (Research synthesis and analysis reasoning)",
  "summary": "string",
  "sources": [
    { "title": "string", "url": "https://..." }
  ],
  "confidence_score": number,
  "recommended_action": "string",
  "is_breaking_change": boolean
}

Input JSON:
{{INPUT_JSON}}
`;

const QA_PROMPT = `
You are the QA Validator agent. Act as an SDET / Quality Engineer.
Return ONLY valid JSON.

Gate quality with deterministic proof. Use git diffs and command evidence.
Define concrete test cases with expected vs actual outcomes.
For failures, identify the likely code root cause and provide actionable remediation.
Address E2E requirements and QA preferences as human-defined quality gates.

Return exactly:
{
  "thoughtProcess": "string (QA strategy and verification reasoning)",
  "mainScenarios": ["string"],
  "acceptanceChecklist": ["string"],
  "testCases": [
    {
      "id": "string",
      "title": "string",
      "type": "functional | regression | integration | e2e | unit | config",
      "steps": ["string"],
      "expectedResult": "string",
      "actualResult": "string",
      "status": "pass | fail | blocked",
      "evidence": ["string"]
    }
  ],
  "failures": ["string"],
  "verdict": "pass | fail",
  "e2ePlan": ["string"],
  "changedFiles": ["string"],
  "executedChecks": [
    {
      "command": "string",
      "status": "passed | failed | skipped",
      "exitCode": 0,
      "timedOut": false,
      "durationMs": 0,
      "stdoutPreview": "string",
      "stderrPreview": "string",
      "diagnostics": ["string"],
      "qaConfigNotes": ["string"],
      "artifacts": ["string"]
    }
  ],
  "returnContext": [
    {
      "issue": "string",
      "expectedResult": "string",
      "receivedResult": "string",
      "evidence": ["string"],
      "recommendedAction": "string"
    }
  ],
  "nextAgent": "Synx Front Expert | Synx Mobile Expert | Synx Back Expert | Synx SEO Specialist | Human Review"
}

Input JSON:
{{INPUT_JSON}}
`;

