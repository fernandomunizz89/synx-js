export const AI_ROOT = ".ai-agents";
export const TASKS_DIR = ".ai-agents/tasks";
export const LOGS_DIR = ".ai-agents/logs";
export const CONFIG_DIR = ".ai-agents/config";
export const PROMPTS_DIR = ".ai-agents/prompts";
export const RUNTIME_DIR = ".ai-agents/runtime";
export const LOCKS_DIR = ".ai-agents/runtime/locks";
export const POLL_INTERVAL_MS = 1200;
export const STALE_LOCK_MINUTES = 10;

export const STAGE_FILE_NAMES = {
  dispatcher: "00-dispatcher.request.json",
  planner: "02-planner.request.json",
  bugInvestigator: "02b-bug-investigator.request.json",
  bugFixer: "04b-bug-fixer.request.json",
  builder: "04-builder.request.json",
  reviewer: "05-reviewer.request.json",
  qa: "06-qa.request.json",
  pr: "07-pr.request.json",
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
};

export const REQUIRED_PROMPT_FILES = [
  "dispatcher.md",
  "spec-planner.md",
  "bug-investigator.md",
  "bug-fixer.md",
  "feature-builder.md",
  "reviewer.md",
  "qa-validator.md",
  "pr-writer.md",
] as const;
