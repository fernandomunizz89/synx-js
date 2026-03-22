import path from "node:path";
import { readText } from "../lib/fs.js";
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
      await applyWorkspaceEdits({ edits: parsed.edits, workspaceRoot });

      const nextAgent = parsed.nextAgent ?? this.definition.defaultNextAgent ?? "Human Review";

      await this.finishStage({
        taskId,
        stage,
        doneFileName: `${stage}.done.json`,
        viewFileName: `${stage}.md`,
        viewContent: `# ${this.definition.name}\n\n${parsed.implementationSummary}`,
        output: parsed,
        nextAgent: nextAgent as any,
        nextStage: nextAgent.toLowerCase().replace(/\s+/g, "-"),
        nextRequestFileName: `custom-${nextAgent.toLowerCase().replace(/\s+/g, "-")}.request.json`,
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
        nextStage: nextAgent.toLowerCase().replace(/\s+/g, "-"),
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

const KNOWN_AGENT_REQUEST_FILES: Record<string, string> = {
  "Synx Front Expert": "04-synx-front-expert.request.json",
  "Synx Mobile Expert": "04-synx-mobile-expert.request.json",
  "Synx Back Expert": "04-synx-back-expert.request.json",
  "Synx QA Engineer": "06-synx-qa-engineer.request.json",
  "Synx SEO Specialist": "04-synx-seo-specialist.request.json",
  "Dispatcher": "00-dispatcher.request.json",
};

function resolveNextRequestFileName(nextAgent: string): string {
  if (KNOWN_AGENT_REQUEST_FILES[nextAgent]) {
    return KNOWN_AGENT_REQUEST_FILES[nextAgent];
  }
  // Custom agent: derive from name
  const id = nextAgent.toLowerCase().replace(/\s+/g, "-");
  return `custom-${id}.request.json`;
}
