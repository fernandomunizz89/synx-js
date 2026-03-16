export const AI_ROOT = ".ai-agents";
export const TASKS_DIR = ".ai-agents/tasks";
export const LOGS_DIR = ".ai-agents/logs";
export const CONFIG_DIR = ".ai-agents/config";
export const PROMPTS_DIR = ".ai-agents/prompts";
export const RUNTIME_DIR = ".ai-agents/runtime";
export const LOCKS_DIR = ".ai-agents/runtime/locks";
export const POLL_INTERVAL_MS = 1200;
export const STALE_LOCK_MINUTES = 10;
export const DEFAULT_QA_MAX_RETRIES = 3;

export const STAGE_FILE_NAMES = {
  dispatcher: "00-dispatcher.request.json",
  planner: "02-planner.request.json",
  bugInvestigator: "02b-bug-investigator.request.json",
  bugFixer: "04b-bug-fixer.request.json",
  builder: "04-builder.request.json",
  reviewer: "05-reviewer.request.json",
  qa: "06-qa.request.json",
  pr: "07-pr.request.json",
  // Dream Stack 2026 – Expert Squad
  sinxFrontExpert: "04-sinx-front-expert.request.json",
  sinxMobileExpert: "04-sinx-mobile-expert.request.json",
  sinxBackExpert: "04-sinx-back-expert.request.json",
  sinxQaEngineer: "06-sinx-qa-engineer.request.json",
  sinxSeoSpecialist: "04-sinx-seo-specialist.request.json",
};

export const DONE_FILE_NAMES = {
  dispatcher: "01-dispatcher.done.json",
  planner: "02-planner.done.json",
  bugInvestigator: "02b-bug-investigator.done.json",
  bugFixer: "04b-bug-fixer.done.json",
  builder: "04-implementation.done.json",
  reviewer: "05-review.done.json",
  qa: "06-qa.done.json",
  pr: "07-pr.done.json",
  // Dream Stack 2026 – Expert Squad
  sinxFrontExpert: "04-sinx-front-expert.done.json",
  sinxMobileExpert: "04-sinx-mobile-expert.done.json",
  sinxBackExpert: "04-sinx-back-expert.done.json",
  sinxQaEngineer: "06-sinx-qa-engineer.done.json",
  sinxSeoSpecialist: "04-sinx-seo-specialist.done.json",
};

export const REQUIRED_PROMPT_FILES = [
  "dispatcher.md",
  "spec-planner.md",
  "bug-investigator.md",
  "bug-fixer.md",
  "feature-builder.md",
  "researcher.md",
  "reviewer.md",
  "qa-validator.md",
  "pr-writer.md",
  // Dream Stack 2026 – Expert Squad
  "sinx-front-expert.md",
  "sinx-mobile-expert.md",
  "sinx-back-expert.md",
  "sinx-qa-engineer.md",
  "sinx-seo-specialist.md",
] as const;
