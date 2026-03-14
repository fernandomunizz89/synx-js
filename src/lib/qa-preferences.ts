import type { E2EFramework, E2EPolicy, NewTaskInput, TaskType } from "./types.js";

const DEFAULT_E2E_REQUIRED_TYPES = new Set<TaskType>(["Feature", "Bug", "Refactor", "Mixed"]);

function normalizePolicy(value: unknown): E2EPolicy {
  if (value === "required" || value === "skip" || value === "auto") return value;
  return "auto";
}

function normalizeFramework(value: unknown): E2EFramework {
  if (value === "cypress" || value === "playwright" || value === "other" || value === "auto") return value;
  return "auto";
}

function defaultObjective(e2eRequired: boolean, framework: E2EFramework): string {
  if (!e2eRequired) return "E2E generation is optional for this task.";
  if (framework === "cypress") return "Make Cypress E2E tests pass.";
  if (framework === "playwright") return "Make Playwright E2E tests pass.";
  if (framework === "other") return "Make the project's E2E tests pass.";
  return "Make the project's main-flow E2E tests pass.";
}

export interface ResolvedQaPreferences {
  e2ePolicy: E2EPolicy;
  e2eFramework: E2EFramework;
  e2eRequired: boolean;
  objective: string;
}

export function resolveTaskQaPreferences(task: NewTaskInput): ResolvedQaPreferences {
  const input = task.extraContext?.qaPreferences;
  const e2ePolicy = normalizePolicy(input?.e2ePolicy);
  const e2eFramework = normalizeFramework(input?.e2eFramework);

  const defaultRequired = DEFAULT_E2E_REQUIRED_TYPES.has(task.typeHint);
  const e2eRequired = e2ePolicy === "required"
    ? true
    : e2ePolicy === "skip"
      ? false
      : defaultRequired;
  const objective = (input?.objective || "").trim() || defaultObjective(e2eRequired, e2eFramework);

  return {
    e2ePolicy,
    e2eFramework,
    e2eRequired,
    objective,
  };
}

export function matchesE2EFrameworkCommand(command: string, framework: E2EFramework): boolean {
  if (framework === "auto" || framework === "other") return /\be2e\b|playwright|cypress/i.test(command);
  if (framework === "cypress") return /\bcypress\b/i.test(command);
  if (framework === "playwright") return /\bplaywright\b/i.test(command);
  return /\be2e\b|playwright|cypress/i.test(command);
}

export function preferredE2ECommand(framework: E2EFramework, scripts: string[]): string {
  const normalized = scripts.map((script) => script.trim()).filter(Boolean);
  const pickBy = (matcher: (name: string) => boolean): string | undefined => normalized.find(matcher);

  if (framework === "cypress") {
    const cypress = pickBy((name) => /\bcypress\b/i.test(name));
    if (cypress) return `npm run --if-present ${cypress}`;
  }

  if (framework === "playwright") {
    const playwright = pickBy((name) => /\bplaywright\b/i.test(name));
    if (playwright) return `npm run --if-present ${playwright}`;
  }

  const generic = pickBy((name) => /\be2e\b/i.test(name)) || normalized[0];
  if (generic) return `npm run --if-present ${generic}`;

  if (framework === "cypress") return "npm run --if-present cypress";
  if (framework === "playwright") return "npm run --if-present playwright:test";
  return "npm run --if-present e2e";
}
