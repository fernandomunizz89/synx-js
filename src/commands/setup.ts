import { Command } from "commander";
import path from "node:path";
import { ensureGlobalInitialized, ensureProjectInitialized } from "../lib/bootstrap.js";
import { configDir, globalConfigPath, repoRoot } from "../lib/paths.js";
import { readJson, writeJson } from "../lib/fs.js";
import { checkProviderHealth } from "../lib/provider-health.js";
import { confirmAction, promptRequiredText, promptTextWithDefault, selectOption } from "../lib/interactive.js";
import { providerHealthToHuman } from "../lib/human-messages.js";
import { commandExample } from "../lib/cli-command.js";
import type { AgentName, GlobalConfig, LocalProjectConfig, ProviderStageConfig } from "../lib/types.js";
import {
  defaultOpenAiCompatibleFields,
  isProviderHealthy,
  printSetupFixHints,
} from "../lib/setup-helpers.js";
import {
  configureAnthropic,
  configureGoogle,
  configureLmStudio,
  configureOpenAiCompatible,
} from "../lib/setup-providers.js";

type SetupProviderChoice = "mock" | "lm-studio" | "openai-compatible" | "google" | "anthropic";

const EXPERT_AGENTS: Array<{ name: AgentName; label: string }> = [
  { name: "Synx Front Expert", label: "Front Expert (Next.js, TailwindCSS)" },
  { name: "Synx Mobile Expert", label: "Mobile Expert (Expo, React Native)" },
  { name: "Synx Back Expert", label: "Back Expert (NestJS, Fastify, Prisma)" },
  { name: "Synx QA Engineer", label: "QA Engineer (Playwright, Vitest)" },
  { name: "Synx SEO Specialist", label: "SEO Specialist (Core Web Vitals)" },
];

async function chooseProvider(currentGlobal: GlobalConfig): Promise<ProviderStageConfig> {
  const providerChoice = await selectOption<SetupProviderChoice>(
    "Choose provider",
    [
      { value: "mock", label: "Mock (offline/demo mode)" },
      { value: "lm-studio", label: "LM Studio (local OpenAI-compatible server)" },
      { value: "openai-compatible", label: "OpenAI-compatible endpoint (remote or self-hosted)" },
      { value: "google", label: "Google Generative AI (Gemini)", description: "Requires Google API key" },
      { value: "anthropic", label: "Anthropic Claude", description: "Requires Anthropic API key" },
    ],
    "mock"
  );

  if (providerChoice === "mock") {
    return { type: "mock", model: "mock-dispatcher-v1", ...defaultOpenAiCompatibleFields() };
  } else if (providerChoice === "lm-studio") {
    return configureLmStudio(currentGlobal);
  } else if (providerChoice === "google") {
    return configureGoogle(currentGlobal);
  } else if (providerChoice === "anthropic") {
    return configureAnthropic(currentGlobal);
  } else {
    return configureOpenAiCompatible(currentGlobal);
  }
}

async function configureExpertProviders(
  currentGlobal: GlobalConfig,
  defaultProvider: ProviderStageConfig,
  existingAgentProviders: Partial<Record<AgentName, ProviderStageConfig>>,
): Promise<Partial<Record<AgentName, ProviderStageConfig>>> {
  const result: Partial<Record<AgentName, ProviderStageConfig>> = { ...existingAgentProviders };

  console.log("\nPer-expert provider configuration");
  console.log(`Default (inherited from Dispatcher): ${defaultProvider.type} / ${defaultProvider.model}`);
  console.log("Configure a different provider for any expert, or keep the default.");

  for (const expert of EXPERT_AGENTS) {
    const current = result[expert.name];
    const currentLabel = current
      ? `${current.type} / ${current.model}`
      : `default (${defaultProvider.type} / ${defaultProvider.model})`;

    const action = await selectOption<"keep" | "configure" | "reset">(
      `${expert.label} — currently: ${currentLabel}`,
      [
        { value: "keep", label: "Keep current" },
        { value: "configure", label: "Configure a different provider" },
        ...(current ? [{ value: "reset" as const, label: "Reset to default" }] : []),
      ],
      "keep"
    );

    if (action === "configure") {
      result[expert.name] = await chooseProvider(currentGlobal);
    } else if (action === "reset") {
      delete result[expert.name];
    }
  }

  return result;
}

export const setupCommand = new Command("setup")
  .description("Guided setup for the current machine and repository")
  .action(async () => {
    await ensureGlobalInitialized();
    await ensureProjectInitialized();

    const globalPath = globalConfigPath();
    const projectPath = path.join(configDir(), "project.json");
    const currentGlobal = await readJson<GlobalConfig>(globalPath);
    const currentLocal = await readJson<LocalProjectConfig>(projectPath);

    console.log("\nGuided setup");
    console.log(`- Repository detected: ${repoRoot()}`);
    console.log(`- Global config: ${globalPath}`);
    console.log(`- Local project config: ${projectPath}`);
    console.log("- Navigation: use Arrow Up/Down and Enter.");

    while (true) {
      const existingReviewer = currentLocal.humanReviewer || currentGlobal.defaults.humanReviewer;
      if (existingReviewer) {
        console.log(`\nCurrent reviewer in config: ${existingReviewer}`);
        console.log("Please type the reviewer name explicitly to confirm or update it.");
      }

      const reviewer = await promptRequiredText("Human reviewer name (required):");
      const providerChoice = await selectOption<SetupProviderChoice>(
        "Choose provider for Dispatcher and Planner",
        [
          { value: "mock", label: "Mock (offline/demo mode)" },
          { value: "lm-studio", label: "LM Studio (local OpenAI-compatible server)" },
          { value: "openai-compatible", label: "OpenAI-compatible endpoint (remote or self-hosted)" },
          { value: "google", label: "Google Generative AI (Gemini/PaLM)", description: "Use Google Generative Language API with API key" },
          { value: "anthropic", label: "Anthropic Claude Code", description: "Claude Code via Anthropic API key" },
        ],
        "mock"
      );

      const nextGlobal: GlobalConfig = {
        ...currentGlobal,
        providers: {
          ...currentGlobal.providers,
        },
        defaults: {
          ...currentGlobal.defaults,
          humanReviewer: reviewer,
        },
      };

      const nextLocal: LocalProjectConfig = {
        ...currentLocal,
        humanReviewer: reviewer,
      };

      if (providerChoice === "mock") {
        const mockConfig: ProviderStageConfig = {
          type: "mock",
          model: "mock-dispatcher-v1",
          ...defaultOpenAiCompatibleFields(),
        };
        nextGlobal.providers.dispatcher = mockConfig;
        nextGlobal.providers.planner = mockConfig;
      } else if (providerChoice === "lm-studio") {
        const lmStudioConfig = await configureLmStudio(currentGlobal);
        nextGlobal.providers.dispatcher = lmStudioConfig;
        nextGlobal.providers.planner = lmStudioConfig;
      } else if (providerChoice === "google") {
        const googleConfig = await configureGoogle(currentGlobal);
        nextGlobal.providers.dispatcher = googleConfig;
        nextGlobal.providers.planner = googleConfig;
      } else if (providerChoice === "anthropic") {
        const anthropicConfig = await configureAnthropic(currentGlobal);
        nextGlobal.providers.dispatcher = anthropicConfig;
        nextGlobal.providers.planner = anthropicConfig;
      } else {
        const openAiCompatibleConfig = await configureOpenAiCompatible(currentGlobal);
        nextGlobal.providers.dispatcher = openAiCompatibleConfig;
        nextGlobal.providers.planner = openAiCompatibleConfig;
      }

      const dispatcherHealth = await checkProviderHealth(nextGlobal.providers.dispatcher);
      const plannerHealth = await checkProviderHealth(nextGlobal.providers.planner);
      const dispatcherOk = isProviderHealthy(dispatcherHealth);
      const plannerOk = isProviderHealthy(plannerHealth);

      console.log("\nValidation");
      console.log(`- Dispatcher: ${providerHealthToHuman(dispatcherHealth.message)}`);
      console.log(`- Planner: ${providerHealthToHuman(plannerHealth.message)}`);
      if (dispatcherHealth.listedModels?.length) {
        console.log(`- Models detected: ${dispatcherHealth.listedModels.slice(0, 12).join(", ")}`);
      }

      if (dispatcherOk && plannerOk) {
        const configureExperts = await confirmAction(
          "Configure different providers for individual experts? (optional)",
          false
        );

        if (configureExperts) {
          nextGlobal.agentProviders = await configureExpertProviders(
            currentGlobal,
            nextGlobal.providers.dispatcher,
            currentGlobal.agentProviders ?? {},
          );
        }

        // Auto-approve threshold (optional)
        const enableAutoApprove = await confirmAction(
          "Enable auto-approve? (automatically approve tasks above a confidence threshold)",
          false,
        );
        if (enableAutoApprove) {
          const thresholdInput = await promptTextWithDefault(
            "Auto-approve confidence threshold (0.0 to 1.0):",
            "0.85",
          );
          const parsed = Number(thresholdInput);
          if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
            nextLocal.autoApproveThreshold = parsed;
            console.log(`Auto-approve threshold set to ${parsed}`);
          } else {
            console.log("Invalid threshold value — auto-approve disabled.");
          }
        }

        await writeJson(globalPath, nextGlobal);
        await writeJson(projectPath, nextLocal);
        console.log("\nSetup complete.");
        console.log(`Next step: run \`${commandExample("start")}\` to begin processing tasks.`);
        return;
      }

      if (!dispatcherOk) {
        printSetupFixHints("Dispatcher", dispatcherHealth, nextGlobal.providers.dispatcher);
      }
      if (!plannerOk) {
        printSetupFixHints("Planner", plannerHealth, nextGlobal.providers.planner);
      }

      console.log("\nSetup is not complete yet because provider validation failed.");
      const nextAction = await selectOption<"retry" | "mock" | "cancel">(
        "What do you want to do next?",
        [
          { value: "retry", label: "Retry setup choices" },
          { value: "mock", label: "Switch to mock provider and finish setup now" },
          { value: "cancel", label: "Cancel without writing changes" },
        ],
        "retry"
      );

      if (nextAction === "mock") {
        const mockConfig: ProviderStageConfig = {
          type: "mock",
          model: "mock-dispatcher-v1",
          ...defaultOpenAiCompatibleFields(),
        };
        nextGlobal.providers.dispatcher = mockConfig;
        nextGlobal.providers.planner = mockConfig;
        await writeJson(globalPath, nextGlobal);
        await writeJson(projectPath, nextLocal);
        console.log("\nSetup complete with mock provider.");
        console.log(`You can switch providers later by running \`${commandExample("setup")}\` again.`);
        return;
      }

      if (nextAction === "cancel") {
        const confirmCancel = await confirmAction("Exit setup without writing config changes?", true);
        if (confirmCancel) {
          console.log("\nSetup canceled. No changes were written.");
          return;
        }
      }
    }
  });
