import path from "node:path";
import { readText } from "../lib/fs.js";
import { STAGE_FILE_NAMES } from "../lib/constants.js";
import { repoRoot } from "../lib/paths.js";
import { builderOutputSchema, genericAgentOutputSchema } from "../lib/schema.js";
import type { AgentDefinition, StageEnvelope } from "../lib/types.js";
import { nowIso } from "../lib/utils.js";
import { applyWorkspaceEdits } from "../lib/workspace-tools.js";
import { createProvider } from "../providers/factory.js";
import { WorkerBase } from "./base.js";

export class GenericAgent extends WorkerBase {
  readonly agent: string;
  readonly requestFileName: string;
  readonly workingFileName: string;

  constructor(private readonly definition: AgentDefinition) {
    super();
    this.agent = definition.name;
    this.requestFileName = `custom-${definition.id}.request.json`;
    this.workingFileName = `custom-${definition.id}.working.json`;
  }

  protected async processTask(taskId: string, request: StageEnvelope): Promise<void> {
    const startedAt = nowIso();
    const promptPath = path.resolve(repoRoot(), this.definition.prompt);
    const prompt = await readText(promptPath);
    const provider = createProvider(this.definition.provider);
    const baseInput = await this.buildAgentInput(taskId, request);
    const stage = `custom-${this.definition.id}`;

    const schemaDescription =
      this.definition.outputSchema === "builder"
        ? 'JSON object with: implementationSummary (string), filesChanged (string[]), changesMade (string[]), testsToRun (string[]), risks (string[]), edits (array of {path, action, content?, find?, replace?}), nextAgent (string)'
        : 'JSON object with: summary (string), result (optional object), nextAgent (optional string)';

    const result = await provider.generateStructured({
      agent: this.agent as any,
      taskType: baseInput.task.typeHint,
      taskId,
      stage,
      systemPrompt: prompt,
      input: baseInput,
      expectedJsonSchemaDescription: schemaDescription,
    });

    if (this.definition.outputSchema === "builder") {
      const parsed = builderOutputSchema.parse(result.parsed);
      const workspaceRoot = process.cwd();
      await applyWorkspaceEdits({ edits: parsed.edits, workspaceRoot, taskId });

      const nextAgent = parsed.nextAgent ?? this.definition.defaultNextAgent ?? "Human Review";

      await this.finishStage({
        taskId,
        stage,
        doneFileName: `${stage}.done.json`,
        viewFileName: `${stage}.md`,
        viewContent: `# ${this.definition.name}\n\n${parsed.implementationSummary}`,
        output: parsed,
        nextAgent: nextAgent as any,
        nextStage: resolveNextStage(nextAgent),
        nextRequestFileName: resolveNextRequestFileName(nextAgent),
        nextInputRef: `done/${stage}.done.json`,
        startedAt,
        provider: result.provider,
        model: result.model,
        parseRetries: result.parseRetries,
        validationPassed: result.validationPassed,
        providerAttempts: result.providerAttempts,
        providerBackoffRetries: result.providerBackoffRetries,
        providerBackoffWaitMs: result.providerBackoffWaitMs,
        estimatedInputTokens: result.estimatedInputTokens,
        estimatedOutputTokens: result.estimatedOutputTokens,
        estimatedTotalTokens: result.estimatedTotalTokens,
        estimatedCostUsd: result.estimatedCostUsd,
      });
    } else {
      const parsed = genericAgentOutputSchema.parse(result.parsed);
      const nextAgent = parsed.nextAgent ?? this.definition.defaultNextAgent ?? "Human Review";

      await this.finishStage({
        taskId,
        stage,
        doneFileName: `${stage}.done.json`,
        viewFileName: `${stage}.md`,
        viewContent: `# ${this.definition.name}\n\n${parsed.summary}`,
        output: parsed,
        nextAgent: nextAgent as any,
        nextStage: resolveNextStage(nextAgent),
        nextRequestFileName: resolveNextRequestFileName(nextAgent),
        nextInputRef: `done/${stage}.done.json`,
        startedAt,
        provider: result.provider,
        model: result.model,
        parseRetries: result.parseRetries,
        validationPassed: result.validationPassed,
        providerAttempts: result.providerAttempts,
        providerBackoffRetries: result.providerBackoffRetries,
        providerBackoffWaitMs: result.providerBackoffWaitMs,
        estimatedInputTokens: result.estimatedInputTokens,
        estimatedOutputTokens: result.estimatedOutputTokens,
        estimatedTotalTokens: result.estimatedTotalTokens,
        estimatedCostUsd: result.estimatedCostUsd,
      });
    }
  }
}

const KNOWN_AGENT_ROUTES: Record<string, { stage: string; requestFileName: string }> = {
  "Synx Front Expert": { stage: "synx-front-expert", requestFileName: STAGE_FILE_NAMES.synxFrontExpert },
  "Synx Mobile Expert": { stage: "synx-mobile-expert", requestFileName: STAGE_FILE_NAMES.synxMobileExpert },
  "Synx Back Expert": { stage: "synx-back-expert", requestFileName: STAGE_FILE_NAMES.synxBackExpert },
  "Synx QA Engineer": { stage: "synx-qa-engineer", requestFileName: STAGE_FILE_NAMES.synxQaEngineer },
  "Synx SEO Specialist": { stage: "synx-seo-specialist", requestFileName: STAGE_FILE_NAMES.synxSeoSpecialist },
  "Synx DevOps Expert": { stage: "synx-devops-expert", requestFileName: STAGE_FILE_NAMES.synxDevopsExpert },
  "Synx Code Reviewer": { stage: "synx-code-reviewer", requestFileName: STAGE_FILE_NAMES.synxCodeReviewer },
  "Synx Security Auditor": { stage: "synx-security-auditor", requestFileName: STAGE_FILE_NAMES.synxSecurityAuditor },
  "Synx Documentation Writer": { stage: "synx-docs-writer", requestFileName: STAGE_FILE_NAMES.synxDocsWriter },
  "Synx DB Architect": { stage: "synx-db-architect", requestFileName: STAGE_FILE_NAMES.synxDbArchitect },
  "Synx Performance Optimizer": { stage: "synx-performance-optimizer", requestFileName: STAGE_FILE_NAMES.synxPerfOptimizer },
  "Synx Release Manager": { stage: "synx-release-manager", requestFileName: STAGE_FILE_NAMES.synxReleaseManager },
  "Synx Incident Triage": { stage: "synx-incident-triage", requestFileName: STAGE_FILE_NAMES.synxIncidentTriage },
  "Synx Customer Feedback Synthesizer": { stage: "synx-customer-feedback-synthesizer", requestFileName: STAGE_FILE_NAMES.synxFeedbackSynth },
  "Dispatcher": { stage: "dispatcher", requestFileName: STAGE_FILE_NAMES.dispatcher },
};

function resolveNextRequestFileName(nextAgent: string): string {
  if (KNOWN_AGENT_ROUTES[nextAgent]) {
    return KNOWN_AGENT_ROUTES[nextAgent].requestFileName;
  }
  // Custom agent: derive from name
  const id = nextAgent.toLowerCase().replace(/\s+/g, "-");
  return `custom-${id}.request.json`;
}

function resolveNextStage(nextAgent: string): string {
  if (KNOWN_AGENT_ROUTES[nextAgent]) {
    return KNOWN_AGENT_ROUTES[nextAgent].stage;
  }
  const id = nextAgent.toLowerCase().replace(/\s+/g, "-");
  return `custom-${id}`;
}
