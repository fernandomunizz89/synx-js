import path from "node:path";
import { Command } from "commander";
import { ensureDir, exists, writeJson, writeText } from "../lib/fs.js";
import { agentsDir, promptsDir } from "../lib/paths.js";
import { loadAgentDefinitions, loadAgentDefinition } from "../lib/agent-registry.js";
import { promptRequiredText, promptTextWithDefault, selectOption, confirmAction } from "../lib/interactive.js";
import type {
  AgentCapabilities,
  AgentDefinition,
  AgentOutputSchema,
  AgentRiskProfile,
  AgentVerificationMode,
  ProviderStageConfig,
  ProviderType,
} from "../lib/types.js";

// ─── Provider defaults ──────────────────────────────────────────────────────

const PROVIDER_DEFAULT_MODELS: Record<string, string> = {
  anthropic: "claude-sonnet-4-6",
  "openai-compatible": "gpt-4o",
  google: "gemini-3.0-flash",
  lmstudio: "auto",
  mock: "static-mock",
};

const KNOWN_TASK_TYPES = ["Feature", "Bug", "Refactor", "Research", "Documentation", "Mixed", "Project"] as const;
const KNOWN_RISK_PROFILES = ["low", "medium", "high"] as const;
const KNOWN_VERIFICATION_MODES = [
  "static_review",
  "unit_tests",
  "integration_tests",
  "e2e_tests",
  "security_checks",
  "performance_checks",
  "manual_review",
] as const;

function parseCsv(value: string | undefined): string[] {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseTaskTypes(value: string | undefined, fallback: AgentCapabilities["taskTypes"]): AgentCapabilities["taskTypes"] {
  const parsed = parseCsv(value);
  if (!parsed.length) return fallback;
  const invalid = parsed.filter((entry) => !KNOWN_TASK_TYPES.includes(entry as typeof KNOWN_TASK_TYPES[number]));
  if (invalid.length) {
    throw new Error(`Invalid --task-types value(s): ${invalid.join(", ")}. Allowed: ${KNOWN_TASK_TYPES.join(", ")}`);
  }
  return parsed as AgentCapabilities["taskTypes"];
}

function parseRiskProfile(value: string | undefined, fallback: AgentRiskProfile): AgentRiskProfile {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (!KNOWN_RISK_PROFILES.includes(normalized as typeof KNOWN_RISK_PROFILES[number])) {
    throw new Error(`Invalid --risk-profile value "${value}". Allowed: ${KNOWN_RISK_PROFILES.join(", ")}`);
  }
  return normalized as AgentRiskProfile;
}

function parseVerificationModes(
  value: string | undefined,
  fallback: AgentCapabilities["preferredVerificationModes"],
): AgentCapabilities["preferredVerificationModes"] {
  const parsed = parseCsv(value);
  if (!parsed.length) return fallback;
  const invalid = parsed.filter((entry) => !KNOWN_VERIFICATION_MODES.includes(entry as typeof KNOWN_VERIFICATION_MODES[number]));
  if (invalid.length) {
    throw new Error(`Invalid --verification-modes value(s): ${invalid.join(", ")}. Allowed: ${KNOWN_VERIFICATION_MODES.join(", ")}`);
  }
  return parsed as AgentVerificationMode[];
}

function defaultCapabilitiesForOutputSchema(outputSchema: AgentOutputSchema): AgentCapabilities {
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

function buildProviderConfig(type: ProviderType, model: string): ProviderStageConfig {
  const config: ProviderStageConfig = { type, model };
  if (type === "anthropic") {
    config.apiKeyEnv = "AI_AGENTS_ANTHROPIC_API_KEY";
  } else if (type === "openai-compatible") {
    config.apiKeyEnv = "AI_AGENTS_OPENAI_API_KEY";
    config.baseUrl = "https://api.openai.com/v1";
  } else if (type === "google") {
    config.apiKeyEnv = "AI_AGENTS_GOOGLE_API_KEY";
  } else if (type === "lmstudio") {
    config.autoDiscoverModel = true;
    config.baseUrl = "http://localhost:1234/v1";
  }
  return config;
}

function buildStarterPrompt(agentName: string, outputSchema: AgentOutputSchema): string {
  const outputSection =
    outputSchema === "builder"
      ? `Return a JSON object with:
- \`implementationSummary\` (string): What was implemented
- \`filesChanged\` (string[]): List of changed files
- \`changesMade\` (string[]): Description of each change
- \`testsToRun\` (string[]): Test commands to run
- \`risks\` (string[]): Known risks
- \`edits\` (array): File edits with \`path\`, \`action\`, and \`content\`/\`find\`/\`replace\`
- \`nextAgent\` (string): Next agent to hand off to`
      : `Return a JSON object with:
- \`summary\` (string): Brief description of what you did
- \`result\` (object, optional): Your structured output data
- \`nextAgent\` (string, optional): Agent to hand off to next`;

  return `# ${agentName}

You are ${agentName}, a specialized AI agent in the Synx pipeline.

## Role

<!-- Describe what this agent does and its area of expertise -->

## Responsibilities

<!-- List the specific responsibilities of this agent -->
<!-- Example:
- Analyze the incoming task and extract key requirements
- Identify the best approach based on context
- Produce structured output for the next agent
-->

## Context

You will receive:
- \`task\`: The original task input with title, rawRequest, and extraContext
- \`pipelineContext\`: Current step index, pipeline name, and outputs from previous steps

Use \`pipelineContext.previousSteps\` to build on prior work rather than repeating it.

## Output Format

${outputSection}
`;
}

// ─── synx agent list ────────────────────────────────────────────────────────

const agentListCommand = new Command("list")
  .description("List all registered custom agents")
  .action(async () => {
    let agents: AgentDefinition[];
    try {
      agents = await loadAgentDefinitions();
    } catch {
      console.log("No agents directory found.");
      return;
    }

    if (agents.length === 0) {
      console.log("No custom agents defined yet.");
      console.log(`Run \`synx agent create\` to create one.`);
      return;
    }

    console.log(`\nCustom Agents (${agents.length})`);
    for (const agent of agents) {
      console.log(`\n  ${agent.id}`);
      console.log(`  - Name:         ${agent.name}`);
      console.log(`  - Provider:     ${agent.provider.type} / ${agent.provider.model}`);
      console.log(`  - Output:       ${agent.outputSchema}`);
      if (agent.defaultNextAgent) {
        console.log(`  - Next agent:   ${agent.defaultNextAgent}`);
      }
      if (agent.capabilities) {
        console.log(`  - Domain:       ${agent.capabilities.domain.join(", ") || "[none]"}`);
        console.log(`  - Frameworks:   ${agent.capabilities.frameworks.join(", ") || "[none]"}`);
        console.log(`  - Languages:    ${agent.capabilities.languages.join(", ") || "[none]"}`);
        console.log(`  - Task types:   ${agent.capabilities.taskTypes.join(", ") || "[none]"}`);
        console.log(`  - Risk:         ${agent.capabilities.riskProfile}`);
      }
      console.log(`  - Prompt:       ${agent.prompt}`);
    }
  });

// ─── synx agent show ────────────────────────────────────────────────────────

const agentShowCommand = new Command("show")
  .description("Show details of a custom agent")
  .argument("<id>", "Agent ID")
  .action(async (id: string) => {
    let agent: AgentDefinition;
    try {
      agent = await loadAgentDefinition(id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(1);
    }

    console.log(`\nAgent: ${agent.id}`);
    console.log(`- Name:           ${agent.name}`);
    console.log(`- Output schema:  ${agent.outputSchema}`);
    console.log(`- Prompt file:    ${agent.prompt}`);
    if (agent.defaultNextAgent) {
      console.log(`- Default next:   ${agent.defaultNextAgent}`);
    }
    if (agent.capabilities) {
      console.log(`- Capabilities:`);
      console.log(`    domain:       ${agent.capabilities.domain.join(", ") || "[none]"}`);
      console.log(`    frameworks:   ${agent.capabilities.frameworks.join(", ") || "[none]"}`);
      console.log(`    languages:    ${agent.capabilities.languages.join(", ") || "[none]"}`);
      console.log(`    taskTypes:    ${agent.capabilities.taskTypes.join(", ") || "[none]"}`);
      console.log(`    riskProfile:  ${agent.capabilities.riskProfile}`);
      console.log(`    verification: ${agent.capabilities.preferredVerificationModes.join(", ") || "[none]"}`);
    }
    console.log(`- Provider:`);
    console.log(`    type:         ${agent.provider.type}`);
    console.log(`    model:        ${agent.provider.model}`);
    if (agent.provider.apiKeyEnv) console.log(`    apiKeyEnv:    ${agent.provider.apiKeyEnv}`);
    if (agent.provider.baseUrl) console.log(`    baseUrl:      ${agent.provider.baseUrl}`);
    if (agent.provider.baseUrlEnv) console.log(`    baseUrlEnv:   ${agent.provider.baseUrlEnv}`);
    if (agent.provider.autoDiscoverModel) console.log(`    autoDiscover: true`);
  });

// ─── synx agent create ──────────────────────────────────────────────────────

const agentCreateCommand = new Command("create")
  .description("Interactively create a new custom agent")
  .option("--id <id>", "Agent ID (lowercase, kebab-case)")
  .option("--name <name>", "Display name")
  .option("--provider <provider>", "Provider type: anthropic | openai-compatible | google | lmstudio | mock")
  .option("--model <model>", "Model name")
  .option("--output-schema <schema>", "Output schema: generic | builder", "generic")
  .option("--default-next-agent <agent>", "Default next agent")
  .option("--domains <domains>", "Comma-separated capability domains")
  .option("--frameworks <frameworks>", "Comma-separated capability frameworks")
  .option("--languages <languages>", "Comma-separated capability languages")
  .option("--task-types <taskTypes>", "Comma-separated task types")
  .option("--risk-profile <riskProfile>", "Risk profile: low | medium | high")
  .option("--verification-modes <modes>", "Comma-separated verification modes")
  .option("--no-prompt-file", "Skip creating a starter prompt file")
  .action(async (options) => {
    console.log("\nCreate a custom agent");
    console.log("─────────────────────");

    // ── ID ──
    let agentId: string = options.id || "";
    if (!agentId) {
      agentId = await promptRequiredText("Agent ID (lowercase, kebab-case, e.g. my-analyst):");
    }
    agentId = agentId.toLowerCase().replace(/\s+/g, "-");

    // Check if already exists
    const dir = agentsDir();
    const agentFile = path.join(dir, `${agentId}.json`);
    if (await exists(agentFile)) {
      const overwrite = await confirmAction(`Agent "${agentId}" already exists. Overwrite?`, false);
      if (!overwrite) {
        console.log("Aborted.");
        return;
      }
    }

    // ── Name ──
    const defaultName = agentId
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    const agentName: string = options.name || await promptTextWithDefault("Display name:", defaultName);

    // ── Output schema ──
    const outputSchema: AgentOutputSchema = options.outputSchema === "builder"
      ? "builder"
      : options.outputSchema === "generic"
        ? "generic"
        : await selectOption<AgentOutputSchema>(
          "Output schema",
          [
            {
              value: "generic",
              label: "Generic",
              description: "summary + optional result object + nextAgent — best for research, analysis, planning",
            },
            {
              value: "builder",
              label: "Builder",
              description: "implementationSummary + file edits + nextAgent — best for coding agents",
            },
          ],
          "generic"
        );

    // ── Provider type ──
    type ProviderChoice = ProviderType;
    const providerType: ProviderChoice = options.provider as ProviderType || await selectOption<ProviderChoice>(
      "Provider",
      [
        { value: "anthropic", label: "Anthropic", description: "Claude models via Anthropic API" },
        { value: "openai-compatible", label: "OpenAI-compatible", description: "GPT-4o, GPT-4, or any OpenAI-compatible endpoint" },
        { value: "google", label: "Google", description: "Gemini models via Google Generative AI" },
        { value: "lmstudio", label: "LM Studio", description: "Local models via LM Studio server" },
        { value: "mock", label: "Mock", description: "Deterministic mock for testing" },
      ],
      "anthropic"
    );

    // ── Model ──
    const defaultModel = PROVIDER_DEFAULT_MODELS[providerType] ?? "";
    const model: string = options.model || await promptTextWithDefault(
      `Model name (${providerType}):`,
      defaultModel,
    );

    // ── Provider config ──
    const providerConfig = buildProviderConfig(providerType, model);

    // ── Optional overrides (interactive only) ──
    if (!options.provider && providerType === "openai-compatible") {
      const customBase = await promptTextWithDefault(
        "Base URL (OpenAI-compatible endpoint):",
        providerConfig.baseUrl ?? "https://api.openai.com/v1",
      );
      if (customBase) providerConfig.baseUrl = customBase;

      const customKeyEnv = await promptTextWithDefault(
        "API key env var:",
        providerConfig.apiKeyEnv ?? "AI_AGENTS_OPENAI_API_KEY",
      );
      if (customKeyEnv) providerConfig.apiKeyEnv = customKeyEnv;
    }

    // ── Default next agent ──
    const promptFile = `.ai-agents/prompts/${agentId}.md`;
    const defaultNext = options.defaultNextAgent || await promptTextWithDefault(
      "Default next agent (leave blank for Human Review):",
      "",
      "",
    );

    // ── Capabilities ──
    const fallbackCapabilities = defaultCapabilitiesForOutputSchema(outputSchema);
    const capabilities: AgentCapabilities = {
      domain: parseCsv(options.domains).length ? parseCsv(options.domains) : fallbackCapabilities.domain,
      frameworks: parseCsv(options.frameworks),
      languages: parseCsv(options.languages),
      taskTypes: parseTaskTypes(options.taskTypes, fallbackCapabilities.taskTypes),
      riskProfile: parseRiskProfile(options.riskProfile, fallbackCapabilities.riskProfile),
      preferredVerificationModes: parseVerificationModes(options.verificationModes, fallbackCapabilities.preferredVerificationModes),
    };

    // ── Build definition ──
    const definition: AgentDefinition = {
      id: agentId,
      name: agentName,
      prompt: promptFile,
      provider: providerConfig,
      outputSchema,
      capabilities,
      ...(defaultNext?.trim() ? { defaultNextAgent: defaultNext.trim() } : {}),
    };

    // ── Write agent JSON ──
    await ensureDir(dir);
    await writeJson(agentFile, definition);
    console.log(`\nAgent definition written: ${agentFile}`);

    // ── Write starter prompt ──
    if (options.promptFile !== false) {
      const promptsDirectory = promptsDir();
      const promptFilePath = path.join(promptsDirectory, `${agentId}.md`);
      if (!(await exists(promptFilePath))) {
        await ensureDir(promptsDirectory);
        await writeText(promptFilePath, buildStarterPrompt(agentName, outputSchema));
        console.log(`Starter prompt written:   ${promptFilePath}`);
      } else {
        console.log(`Prompt already exists, skipped: ${promptFilePath}`);
      }
    }

    console.log(`\nDone. Use this agent in a pipeline step:`);
    console.log(`  { "agent": "${agentId}" }`);
    console.log(`Or with a provider override:`);
    console.log(`  { "agent": "${agentId}", "providerOverride": "${providerType}/${model}" }`);
  });

// ─── Export ─────────────────────────────────────────────────────────────────

export const agentCommand = new Command("agent")
  .description("Manage custom agents")
  .addCommand(agentListCommand)
  .addCommand(agentShowCommand)
  .addCommand(agentCreateCommand);
