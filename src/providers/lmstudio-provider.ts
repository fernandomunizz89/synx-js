import type { AgentName, ProviderRequest, ProviderResult, ProviderStageConfig } from "../lib/types.js";
import type { LlmProvider } from "./provider.js";
import { discoverProviderModels } from "../lib/provider-health.js";
import { findDiscoveredModelMatch } from "../lib/model-support.js";
import {
  isAutoModelToken,
  resolveLmStudioRuntimeSettings,
  toLmStudioBridgeProviderConfig,
} from "../lib/lmstudio.js";
import { logProviderModelResolution } from "../lib/logging.js";
import { OpenAiCompatibleProvider } from "./openai-compatible-provider.js";

interface ResolvedModelSelection {
  model: string;
  reason: string;
  listedModels: string[];
}

function normalizeTaskAgent(request: ProviderRequest): AgentName {
  return request.agent as AgentName;
}

export class LmStudioProvider implements LlmProvider {
  private readonly config: ProviderStageConfig;
  private readonly providerByModel = new Map<string, OpenAiCompatibleProvider>();
  private lastAutoModel = "";

  constructor(config: ProviderStageConfig) {
    this.config = config;
  }

  private getOpenAiBridgeProvider(model: string): OpenAiCompatibleProvider {
    const cached = this.providerByModel.get(model);
    if (cached) return cached;

    const bridgeConfig = toLmStudioBridgeProviderConfig(this.config, model);
    const provider = new OpenAiCompatibleProvider(bridgeConfig);
    this.providerByModel.set(model, provider);
    return provider;
  }

  private pickAutoModel(models: string[], configuredModel: string, fallbackModel: string): ResolvedModelSelection {
    if (!models.length) {
      throw new Error("LM Studio model discovery returned no loaded models.");
    }

    const configuredCandidate = isAutoModelToken(configuredModel) ? "" : configuredModel;
    if (configuredCandidate) {
      const configuredMatch = findDiscoveredModelMatch(configuredCandidate, models);
      if (configuredMatch?.matchedModel) {
        return {
          model: configuredMatch.matchedModel,
          reason: "Configured model matched a loaded LM Studio model.",
          listedModels: models,
        };
      }
    }

    if (fallbackModel) {
      const fallbackMatch = findDiscoveredModelMatch(fallbackModel, models);
      if (fallbackMatch?.matchedModel) {
        return {
          model: fallbackMatch.matchedModel,
          reason: "Fallback model matched a loaded LM Studio model.",
          listedModels: models,
        };
      }
    }

    if (this.lastAutoModel) {
      const stickyMatch = findDiscoveredModelMatch(this.lastAutoModel, models);
      if (stickyMatch?.matchedModel) {
        return {
          model: stickyMatch.matchedModel,
          reason: "Reused previously auto-detected LM Studio model still loaded.",
          listedModels: models,
        };
      }
    }

    return {
      model: models[0],
      reason: "Using first loaded LM Studio model from discovery response.",
      listedModels: models,
    };
  }

  private async resolveModel(request: ProviderRequest): Promise<ResolvedModelSelection> {
    const settings = resolveLmStudioRuntimeSettings(this.config);
    const configuredModel = settings.configuredModel;
    const fallbackModel = settings.fallbackModel;
    const autoMode = settings.autoDiscoverModel;

    if (!autoMode) {
      if (!isAutoModelToken(configuredModel)) {
        return {
          model: configuredModel,
          reason: "Using fixed configured LM Studio model because autodiscovery is disabled.",
          listedModels: [],
        };
      }
      if (fallbackModel) {
        return {
          model: fallbackModel,
          reason: "Autodiscovery is disabled and model is auto; using fallback model.",
          listedModels: [],
        };
      }
      throw new Error(
        "LM Studio autodiscovery is disabled but no fixed model is configured. Set model to a fixed id or enable autodiscovery.",
      );
    }

    await logProviderModelResolution({
      agent: normalizeTaskAgent(request),
      taskId: request.taskId,
      stage: request.stage,
      provider: "lmstudio",
      event: "model_resolution_started",
      configuredModel,
      fallbackModel,
      autoDiscoveryEnabled: autoMode,
      baseUrl: settings.baseUrlRoot,
      reason: "Starting LM Studio model autodiscovery.",
    }).catch(() => undefined);

    const discovery = await discoverProviderModels(this.config);
    if (discovery.reachable && discovery.models.length) {
      const selected = this.pickAutoModel(discovery.models, configuredModel, fallbackModel);
      this.lastAutoModel = selected.model;
      await logProviderModelResolution({
        agent: normalizeTaskAgent(request),
        taskId: request.taskId,
        stage: request.stage,
        provider: "lmstudio",
        event: "model_resolution_succeeded",
        configuredModel,
        selectedModel: selected.model,
        fallbackModel,
        autoDiscoveryEnabled: autoMode,
        baseUrl: settings.baseUrlRoot,
        listedModels: discovery.models,
        reason: selected.reason,
      }).catch(() => undefined);
      return selected;
    }

    if (fallbackModel) {
      await logProviderModelResolution({
        agent: normalizeTaskAgent(request),
        taskId: request.taskId,
        stage: request.stage,
        provider: "lmstudio",
        event: "model_resolution_succeeded",
        configuredModel,
        selectedModel: fallbackModel,
        fallbackModel,
        autoDiscoveryEnabled: autoMode,
        baseUrl: settings.baseUrlRoot,
        listedModels: discovery.models,
        reason: `Autodiscovery failed (${discovery.message}). Falling back to configured fallback model.`,
      }).catch(() => undefined);
      return {
        model: fallbackModel,
        reason: `Autodiscovery failed (${discovery.message}). Using fallback model.`,
        listedModels: discovery.models,
      };
    }

    await logProviderModelResolution({
      agent: normalizeTaskAgent(request),
      taskId: request.taskId,
      stage: request.stage,
      provider: "lmstudio",
      event: "model_resolution_failed",
      configuredModel,
      fallbackModel,
      autoDiscoveryEnabled: autoMode,
      baseUrl: settings.baseUrlRoot,
      listedModels: discovery.models,
      reason: discovery.message,
    }).catch(() => undefined);

    throw new Error(
      `LM Studio model autodiscovery failed: ${discovery.message}. Load a model in LM Studio or configure fallbackModel/AI_AGENTS_LMSTUDIO_FALLBACK_MODEL.`,
    );
  }

  async generateStructured(request: ProviderRequest): Promise<ProviderResult> {
    const selected = await this.resolveModel(request);
    const bridge = this.getOpenAiBridgeProvider(selected.model);
    const result = await bridge.generateStructured(request);
    return {
      ...result,
      provider: "lmstudio",
      model: selected.model,
    };
  }
}
