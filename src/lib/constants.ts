export const AI_ROOT = ".ai-agents";
export const TASKS_DIR = ".ai-agents/tasks";
export const LOGS_DIR = ".ai-agents/logs";
export const CONFIG_DIR = ".ai-agents/config";
export const PROMPTS_DIR = ".ai-agents/prompts";
export const RUNTIME_DIR = ".ai-agents/runtime";
export const LOCKS_DIR = ".ai-agents/runtime/locks";
export const AGENTS_DIR = ".ai-agents/agents";
export const PIPELINES_DIR = ".ai-agents/pipelines";
export const PIPELINE_EXECUTOR_STAGE_FILE = "pipeline-executor.request.json";
export const POLL_INTERVAL_MS = 1200;
export const STALE_LOCK_MINUTES = 10;
export const DEFAULT_QA_MAX_RETRIES = 3;

export const STAGE_FILE_NAMES = {
  projectOrchestrator: "00-project-orchestrator.request.json",
  dispatcher: "00-dispatcher.request.json",
  // Dream Stack 2026 – Expert Squad
  synxFrontExpert:   "04-synx-front-expert.request.json",
  synxMobileExpert:  "04-synx-mobile-expert.request.json",
  synxBackExpert:    "04-synx-back-expert.request.json",
  synxQaEngineer:    "06-synx-qa-engineer.request.json",
  synxSeoSpecialist: "04-synx-seo-specialist.request.json",
  // Phase 2 – Extended Squad
  synxCodeReviewer:  "07-synx-code-reviewer.request.json",
  synxDevopsExpert:  "04-synx-devops-expert.request.json",
};

export const DONE_FILE_NAMES = {
  dispatcher: "01-dispatcher.done.json",
  // Dream Stack 2026 – Expert Squad
  synxFrontExpert:   "04-synx-front-expert.done.json",
  synxMobileExpert:  "04-synx-mobile-expert.done.json",
  synxBackExpert:    "04-synx-back-expert.done.json",
  synxQaEngineer:    "06-synx-qa-engineer.done.json",
  synxSeoSpecialist: "04-synx-seo-specialist.done.json",
  // Phase 2 – Extended Squad
  synxCodeReviewer:  "07-synx-code-reviewer.done.json",
  synxDevopsExpert:  "04-synx-devops-expert.done.json",
};

export const REQUIRED_PROMPT_FILES = [
  "dispatcher.md",
  "researcher.md",
  "qa-validator.md",
  // Dream Stack 2026 – Expert Squad
  "synx-front-expert.md",
  "synx-mobile-expert.md",
  "synx-back-expert.md",
  "synx-qa-engineer.md",
  "synx-seo-specialist.md",
  // Phase 2 – Extended Squad (optional – built-in defaults are used when absent)
  "synx-code-reviewer.md",
  "synx-devops-expert.md",
] as const;
