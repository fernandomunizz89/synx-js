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
  synxCodeReviewer:      "07-synx-code-reviewer.request.json",
  synxDevopsExpert:      "04-synx-devops-expert.request.json",
  // Phase 2.3 / 2.4
  synxSecurityAuditor:   "08-synx-security-auditor.request.json",
  synxDocsWriter:        "04-synx-docs-writer.request.json",
  // Phase 2.5
  synxDbArchitect:       "04-synx-db-architect.request.json",
  // Phase 2.6
  synxPerfOptimizer:     "04-synx-performance-optimizer.request.json",
  // Phase 6
  synxReleaseManager:    "09-synx-release-manager.request.json",
  synxIncidentTriage:    "10-synx-incident-triage.request.json",
  synxFeedbackSynth:     "11-synx-customer-feedback-synthesizer.request.json",
  // Phase 4 – Pre-build Planning Squad
  synxProductStrategist:   "01-synx-product-strategist.request.json",
  synxRequirementsAnalyst: "02-synx-requirements-analyst.request.json",
  synxUxFlowDesigner:      "03-synx-ux-flow-designer.request.json",
  synxSolutionArchitect:   "04-synx-solution-architect.request.json",
  synxDeliveryPlanner:     "05-synx-delivery-planner.request.json",
  projectDecomposer:       "00-project-orchestrator-decompose.request.json",
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
  synxCodeReviewer:      "07-synx-code-reviewer.done.json",
  synxDevopsExpert:      "04-synx-devops-expert.done.json",
  // Phase 2.3 / 2.4
  synxSecurityAuditor:   "08-synx-security-auditor.done.json",
  synxDocsWriter:        "04-synx-docs-writer.done.json",
  // Phase 2.5
  synxDbArchitect:       "04-synx-db-architect.done.json",
  // Phase 2.6
  synxPerfOptimizer:     "04-synx-performance-optimizer.done.json",
  // Phase 6
  synxReleaseManager:    "09-synx-release-manager.done.json",
  synxIncidentTriage:    "10-synx-incident-triage.done.json",
  synxFeedbackSynth:     "11-synx-customer-feedback-synthesizer.done.json",
  // Phase 4 – Pre-build Planning Squad
  synxProductStrategist:   "01-synx-product-strategist.done.json",
  synxRequirementsAnalyst: "02-synx-requirements-analyst.done.json",
  synxUxFlowDesigner:      "03-synx-ux-flow-designer.done.json",
  synxSolutionArchitect:   "04-synx-solution-architect.done.json",
  synxDeliveryPlanner:     "05-synx-delivery-planner.done.json",
  projectOrchestrator:     "00-project-orchestrator.done.json",
  projectDecomposer:       "00-project-orchestrator-decompose.done.json",
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
  // Phase 2.3 / 2.4 (optional – built-in defaults are used when absent)
  "synx-security-auditor.md",
  "synx-docs-writer.md",
  // Phase 2.5 (optional – built-in default used when absent)
  "synx-db-architect.md",
  // Phase 2.6 (optional – built-in default used when absent)
  "synx-performance-optimizer.md",
] as const;
