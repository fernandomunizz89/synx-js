import path from "node:path";
import { promises as fs } from "node:fs";
import { STAGE_FILE_NAMES } from "./constants.js";
import { loadAgentDefinitions } from "./agent-registry.js";
import { exists } from "./fs.js";
import { loadRecentLearnings } from "./learnings.js";
import { logsDir } from "./paths.js";
import type { AgentCapabilities, NewTaskInput, TaskType } from "./types.js";
import type { ProjectProfile } from "./project-detector.js";

type RoutingSource = "built-in" | "custom";

interface CapabilityTarget {
  agentId: string;
  agentName: string;
  source: RoutingSource;
  stage: string;
  requestFileName: string;
  capabilities: AgentCapabilities;
}

export interface CapabilityRoutingScore {
  capabilityMatch: number;
  projectStackMatch: number;
  taskTypeMatch: number;
  approvalRate: number;
  recentFailurePattern: number;
  modelHintBoost: number;
  total: number;
}

export interface CapabilityRoutingCandidate extends CapabilityTarget {
  score: CapabilityRoutingScore;
}

export interface CapabilityRoutingDecision {
  selected: CapabilityRoutingCandidate;
  candidates: CapabilityRoutingCandidate[];
}

const BUILTIN_TARGETS: CapabilityTarget[] = [
  {
    agentId: "synx-front-expert",
    agentName: "Synx Front Expert",
    source: "built-in",
    stage: "synx-front-expert",
    requestFileName: STAGE_FILE_NAMES.synxFrontExpert,
    capabilities: {
      domain: ["frontend", "ui", "ux", "web", "component"],
      frameworks: ["React", "Next.js", "Vue", "Svelte"],
      languages: ["TypeScript", "JavaScript"],
      taskTypes: ["Feature", "Bug", "Refactor", "Mixed"],
      riskProfile: "medium",
      preferredVerificationModes: ["static_review", "unit_tests", "e2e_tests"],
    },
  },
  {
    agentId: "synx-mobile-expert",
    agentName: "Synx Mobile Expert",
    source: "built-in",
    stage: "synx-mobile-expert",
    requestFileName: STAGE_FILE_NAMES.synxMobileExpert,
    capabilities: {
      domain: ["mobile", "ios", "android", "react-native", "expo"],
      frameworks: ["React Native", "Expo", "Flutter"],
      languages: ["TypeScript", "JavaScript", "Kotlin", "Swift"],
      taskTypes: ["Feature", "Bug", "Refactor", "Mixed"],
      riskProfile: "high",
      preferredVerificationModes: ["static_review", "unit_tests", "integration_tests", "e2e_tests"],
    },
  },
  {
    agentId: "synx-back-expert",
    agentName: "Synx Back Expert",
    source: "built-in",
    stage: "synx-back-expert",
    requestFileName: STAGE_FILE_NAMES.synxBackExpert,
    capabilities: {
      domain: ["backend", "api", "server", "database", "endpoint"],
      frameworks: ["Express", "Fastify", "NestJS", "Node"],
      languages: ["TypeScript", "JavaScript", "Python", "Go"],
      taskTypes: ["Feature", "Bug", "Refactor", "Mixed"],
      riskProfile: "high",
      preferredVerificationModes: ["static_review", "unit_tests", "integration_tests"],
    },
  },
  {
    agentId: "synx-qa-engineer",
    agentName: "Synx QA Engineer",
    source: "built-in",
    stage: "synx-qa-engineer",
    requestFileName: STAGE_FILE_NAMES.synxQaEngineer,
    capabilities: {
      domain: ["qa", "test", "testing", "validation"],
      frameworks: ["Playwright", "Vitest", "Jest"],
      languages: ["TypeScript", "JavaScript"],
      taskTypes: ["Feature", "Bug", "Refactor", "Mixed"],
      riskProfile: "medium",
      preferredVerificationModes: ["unit_tests", "integration_tests", "e2e_tests", "manual_review"],
    },
  },
  {
    agentId: "synx-seo-specialist",
    agentName: "Synx SEO Specialist",
    source: "built-in",
    stage: "synx-seo-specialist",
    requestFileName: STAGE_FILE_NAMES.synxSeoSpecialist,
    capabilities: {
      domain: ["seo", "metadata", "search", "schema-markup"],
      frameworks: ["Next.js", "React", "Nuxt"],
      languages: ["TypeScript", "JavaScript"],
      taskTypes: ["Feature", "Bug", "Refactor", "Documentation", "Mixed"],
      riskProfile: "low",
      preferredVerificationModes: ["static_review", "manual_review"],
    },
  },
  {
    agentId: "synx-devops-expert",
    agentName: "Synx DevOps Expert",
    source: "built-in",
    stage: "synx-devops-expert",
    requestFileName: STAGE_FILE_NAMES.synxDevopsExpert,
    capabilities: {
      domain: ["devops", "deployment", "ci", "cd", "infrastructure"],
      frameworks: ["Docker", "GitHub Actions", "Kubernetes"],
      languages: ["TypeScript", "JavaScript", "YAML", "Shell"],
      taskTypes: ["Feature", "Bug", "Refactor", "Research", "Mixed"],
      riskProfile: "high",
      preferredVerificationModes: ["integration_tests", "security_checks", "performance_checks"],
    },
  },
  {
    agentId: "synx-code-reviewer",
    agentName: "Synx Code Reviewer",
    source: "built-in",
    stage: "synx-code-reviewer",
    requestFileName: STAGE_FILE_NAMES.synxCodeReviewer,
    capabilities: {
      domain: ["review", "quality", "maintainability", "readability"],
      frameworks: [],
      languages: ["TypeScript", "JavaScript", "Python", "Go"],
      taskTypes: ["Feature", "Bug", "Refactor", "Mixed"],
      riskProfile: "medium",
      preferredVerificationModes: ["static_review", "manual_review"],
    },
  },
  {
    agentId: "synx-security-auditor",
    agentName: "Synx Security Auditor",
    source: "built-in",
    stage: "synx-security-auditor",
    requestFileName: STAGE_FILE_NAMES.synxSecurityAuditor,
    capabilities: {
      domain: ["security", "auth", "vulnerability", "encryption"],
      frameworks: ["OWASP"],
      languages: ["TypeScript", "JavaScript", "Python", "Go"],
      taskTypes: ["Feature", "Bug", "Refactor", "Mixed"],
      riskProfile: "high",
      preferredVerificationModes: ["security_checks", "integration_tests", "manual_review"],
    },
  },
  {
    agentId: "synx-docs-writer",
    agentName: "Synx Documentation Writer",
    source: "built-in",
    stage: "synx-docs-writer",
    requestFileName: STAGE_FILE_NAMES.synxDocsWriter,
    capabilities: {
      domain: ["documentation", "docs", "readme", "guides"],
      frameworks: [],
      languages: ["TypeScript", "JavaScript", "Markdown"],
      taskTypes: ["Documentation", "Feature", "Mixed"],
      riskProfile: "low",
      preferredVerificationModes: ["static_review", "manual_review"],
    },
  },
  {
    agentId: "synx-db-architect",
    agentName: "Synx DB Architect",
    source: "built-in",
    stage: "synx-db-architect",
    requestFileName: STAGE_FILE_NAMES.synxDbArchitect,
    capabilities: {
      domain: ["database", "schema", "sql", "migration"],
      frameworks: ["PostgreSQL", "MySQL", "SQLite", "Prisma"],
      languages: ["SQL", "TypeScript", "JavaScript"],
      taskTypes: ["Feature", "Bug", "Refactor", "Mixed"],
      riskProfile: "high",
      preferredVerificationModes: ["integration_tests", "performance_checks", "manual_review"],
    },
  },
  {
    agentId: "synx-performance-optimizer",
    agentName: "Synx Performance Optimizer",
    source: "built-in",
    stage: "synx-performance-optimizer",
    requestFileName: STAGE_FILE_NAMES.synxPerfOptimizer,
    capabilities: {
      domain: ["performance", "latency", "optimization", "scalability"],
      frameworks: ["Lighthouse", "Playwright"],
      languages: ["TypeScript", "JavaScript"],
      taskTypes: ["Feature", "Bug", "Refactor", "Mixed"],
      riskProfile: "medium",
      preferredVerificationModes: ["performance_checks", "integration_tests", "e2e_tests"],
    },
  },
];

const KNOWN_TASK_TYPES = new Set<TaskType>([
  "Feature",
  "Bug",
  "Refactor",
  "Research",
  "Documentation",
  "Mixed",
  "Project",
]);

function normalizeList(values: string[] | undefined): string[] {
  return (values || [])
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function normalizeTaskTypes(values: TaskType[] | undefined, fallback: TaskType[]): TaskType[] {
  const raw = (values || []).filter((value): value is TaskType => KNOWN_TASK_TYPES.has(value));
  return raw.length ? raw : fallback;
}

function defaultCapabilitiesForCustomAgent(outputSchema: "generic" | "builder"): AgentCapabilities {
  if (outputSchema === "builder") {
    return {
      domain: ["implementation"],
      frameworks: [],
      languages: [],
      taskTypes: ["Feature", "Bug", "Refactor", "Mixed"],
      riskProfile: "medium",
      preferredVerificationModes: ["static_review", "unit_tests"],
    };
  }

  return {
    domain: ["analysis"],
    frameworks: [],
    languages: [],
    taskTypes: ["Research", "Documentation", "Mixed"],
    riskProfile: "low",
    preferredVerificationModes: ["manual_review"],
  };
}

function toNormalizedCapabilities(
  capabilities: AgentCapabilities | undefined,
  fallback: AgentCapabilities,
): AgentCapabilities {
  const preferredVerificationModes = normalizeList(capabilities?.preferredVerificationModes || []) as AgentCapabilities["preferredVerificationModes"];
  return {
    domain: normalizeList(capabilities?.domain).length ? normalizeList(capabilities?.domain) : fallback.domain,
    frameworks: normalizeList(capabilities?.frameworks),
    languages: normalizeList(capabilities?.languages),
    taskTypes: normalizeTaskTypes(capabilities?.taskTypes, fallback.taskTypes),
    riskProfile: capabilities?.riskProfile || fallback.riskProfile,
    preferredVerificationModes: preferredVerificationModes.length ? preferredVerificationModes : fallback.preferredVerificationModes,
  };
}

function tokenize(input: string): Set<string> {
  return new Set(
    input
      .toLowerCase()
      .split(/[^a-z0-9+.#-]+/)
      .map((token) => token.trim())
      .filter(Boolean),
  );
}

function normalizeValue(value: string): string {
  return value.toLowerCase().trim();
}

function overlapScore(left: string[], right: string[]): number {
  if (!left.length || !right.length) return 0;
  const rightSet = new Set(right.map(normalizeValue));
  const leftValues = left.map(normalizeValue);
  const matches = leftValues.filter((value) => rightSet.has(value)).length;
  return matches > 0 ? matches / Math.max(1, leftValues.length) : 0;
}

function domainMatchScore(domains: string[], taskTokens: Set<string>, taskText: string): number {
  if (!domains.length) return 0.2;
  const normalizedText = taskText.toLowerCase();
  let hits = 0;
  for (const domain of domains) {
    const normalized = normalizeValue(domain);
    if (!normalized) continue;
    const normalizedToken = normalized.replace(/\s+/g, "-");
    if (taskTokens.has(normalizedToken) || taskTokens.has(normalized) || normalizedText.includes(normalized)) {
      hits += 1;
    }
  }
  return hits / Math.max(1, domains.length);
}

function taskTypeMatchScore(taskType: TaskType, supportedTaskTypes: TaskType[]): number {
  if (supportedTaskTypes.includes(taskType)) return 1;
  if (supportedTaskTypes.includes("Mixed")) return 0.6;
  return 0;
}

async function loadApprovalRate(agentName: string, agentId: string): Promise<number> {
  const [nameEntries, idEntries] = await Promise.all([
    loadRecentLearnings(agentName, 30),
    agentId !== agentName ? loadRecentLearnings(agentId, 30) : Promise.resolve([]),
  ]);
  const entries = nameEntries.length >= idEntries.length ? nameEntries : idEntries;
  if (!entries.length) return 0.5;
  const approved = entries.filter((entry) => entry.outcome === "approved").length;
  return approved / entries.length;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

async function loadRecentFailurePatternScore(agentName: string): Promise<number> {
  const filePath = path.join(logsDir(), "agent-audit", `${slugify(agentName)}.jsonl`);
  if (!(await exists(filePath))) return 0.75;

  let raw = "";
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    return 0.75;
  }

  const terminalEvents = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as { event?: string };
      } catch {
        return null;
      }
    })
    .filter((row): row is { event?: string } => Boolean(row))
    .filter((row) => row.event === "stage_finished" || row.event === "stage_failed")
    .slice(-30);

  if (!terminalEvents.length) return 0.75;

  let failures = 0;
  let consecutiveFailureTail = 0;
  for (const event of terminalEvents) {
    if (event.event === "stage_failed") failures += 1;
  }

  for (let index = terminalEvents.length - 1; index >= 0; index -= 1) {
    if (terminalEvents[index].event === "stage_failed") {
      consecutiveFailureTail += 1;
      continue;
    }
    break;
  }

  const failureRate = failures / terminalEvents.length;
  const streakPenalty = Math.min(0.35, consecutiveFailureTail * 0.08);
  return Math.max(0, 1 - failureRate - streakPenalty);
}

function modelHintBoost(modelSuggestedAgent: string, target: CapabilityTarget): number {
  const hint = normalizeValue(modelSuggestedAgent);
  if (!hint) return 0;
  const agentName = normalizeValue(target.agentName);
  const agentId = normalizeValue(target.agentId);
  if (hint === agentName || hint === agentId) return 0.28;
  if (slugify(hint) === slugify(agentName) || slugify(hint) === slugify(agentId)) return 0.16;
  return 0;
}

async function loadCapabilityTargets(): Promise<CapabilityTarget[]> {
  const customDefinitions = await loadAgentDefinitions();
  const customTargets: CapabilityTarget[] = customDefinitions.map((definition) => {
    const fallbackCapabilities = defaultCapabilitiesForCustomAgent(definition.outputSchema);
    return {
      agentId: definition.id,
      agentName: definition.name,
      source: "custom",
      stage: `custom-${definition.id}`,
      requestFileName: `custom-${definition.id}.request.json`,
      capabilities: toNormalizedCapabilities(definition.capabilities, fallbackCapabilities),
    };
  });

  return [...BUILTIN_TARGETS, ...customTargets];
}

export async function routeByCapabilities(args: {
  task: NewTaskInput;
  projectProfile: ProjectProfile;
  modelSuggestedAgent: string;
}): Promise<CapabilityRoutingDecision> {
  const candidates = await loadCapabilityTargets();
  const configuredLanguage = String(args.projectProfile?.configuredProject?.language || "");
  const configuredFramework = String(args.projectProfile?.configuredProject?.framework || "");
  const detectedLanguages = Array.isArray(args.projectProfile?.detectedLanguages) ? args.projectProfile.detectedLanguages : [];
  const detectedFrameworks = Array.isArray(args.projectProfile?.detectedFrameworks) ? args.projectProfile.detectedFrameworks : [];

  const taskTokens = tokenize(`${args.task.title} ${args.task.rawRequest} ${configuredLanguage} ${configuredFramework}`);
  const taskText = `${args.task.title}\n${args.task.rawRequest}`;
  const projectLanguages = [...detectedLanguages, configuredLanguage]
    .map(normalizeValue)
    .filter(Boolean);
  const projectFrameworks = [...detectedFrameworks, configuredFramework]
    .map(normalizeValue)
    .filter(Boolean);

  const scoredCandidates: CapabilityRoutingCandidate[] = await Promise.all(
    candidates.map(async (candidate) => {
      const [approvalRate, recentFailurePattern] = await Promise.all([
        loadApprovalRate(candidate.agentName, candidate.agentId),
        loadRecentFailurePatternScore(candidate.agentName),
      ]);
      const capabilityMatch = domainMatchScore(candidate.capabilities.domain, taskTokens, taskText);
      const frameworkScore = overlapScore(candidate.capabilities.frameworks, projectFrameworks);
      const languageScore = overlapScore(candidate.capabilities.languages, projectLanguages);
      const projectStackMatch = frameworkScore > 0 || languageScore > 0
        ? (frameworkScore + languageScore) / 2
        : candidate.capabilities.frameworks.length === 0 && candidate.capabilities.languages.length === 0
        ? 0.35
        : 0;
      const taskTypeMatch = taskTypeMatchScore(args.task.typeHint, candidate.capabilities.taskTypes);
      const hintBoost = modelHintBoost(args.modelSuggestedAgent, candidate);
      const total =
        (capabilityMatch * 0.32) +
        (projectStackMatch * 0.20) +
        (taskTypeMatch * 0.16) +
        (approvalRate * 0.20) +
        (recentFailurePattern * 0.12) +
        hintBoost;

      return {
        ...candidate,
        score: {
          capabilityMatch,
          projectStackMatch,
          taskTypeMatch,
          approvalRate,
          recentFailurePattern,
          modelHintBoost: hintBoost,
          total,
        },
      };
    }),
  );

  scoredCandidates.sort((left, right) => right.score.total - left.score.total);
  const selected = scoredCandidates[0] || {
    ...BUILTIN_TARGETS[0],
    score: {
      capabilityMatch: 0,
      projectStackMatch: 0,
      taskTypeMatch: 0,
      approvalRate: 0.5,
      recentFailurePattern: 0.75,
      modelHintBoost: 0,
      total: 0,
    },
  };

  return {
    selected,
    candidates: scoredCandidates,
  };
}
