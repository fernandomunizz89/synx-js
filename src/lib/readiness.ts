import { loadResolvedProjectConfig } from "./config.js";
import { providerHealthToHuman } from "./human-messages.js";
import { checkProviderHealth } from "./provider-health.js";
import { commandExample } from "./cli-command.js";
import { exists } from "./fs.js";
import { promptsDir } from "./paths.js";
import { REQUIRED_PROMPT_FILES } from "./constants.js";
import path from "node:path";
import { isAutoModelToken } from "./lmstudio.js";

export type ReadinessSeverity = "error" | "warning";

export interface ReadinessIssue {
  severity: ReadinessSeverity;
  message: string;
}

export interface ReadinessReport {
  ok: boolean;
  issues: ReadinessIssue[];
}

interface ReadinessOptions {
  includeProviderChecks: boolean;
}

function pushIssue(issues: ReadinessIssue[], severity: ReadinessSeverity, message: string): void {
  issues.push({ severity, message });
}

export async function collectReadinessReport(options: ReadinessOptions): Promise<ReadinessReport> {
  const issues: ReadinessIssue[] = [];
  const config = await loadResolvedProjectConfig();

  for (const promptFile of REQUIRED_PROMPT_FILES) {
    const promptPath = path.join(promptsDir(), promptFile);
    if (!(await exists(promptPath))) {
      pushIssue(
        issues,
        "error",
        `Prompt file missing: ${promptFile}. Run \`${commandExample("setup")}\` to recreate defaults.`
      );
    }
  }

  if (!config.humanReviewer.trim()) {
    pushIssue(
      issues,
      "error",
      `Human reviewer is missing. Run \`${commandExample("setup")}\` and set it explicitly.`
    );
  }

  if (options.includeProviderChecks) {
    if (
      !config.providers.dispatcher.model.trim()
      && !(config.providers.dispatcher.type === "lmstudio" && isAutoModelToken(config.providers.dispatcher.model))
    ) {
      pushIssue(
        issues,
        "error",
        `Dispatcher model is empty. Run \`${commandExample("setup")}\` to choose a model.`
      );
    }

    if (
      !config.providers.planner.model.trim()
      && !(config.providers.planner.type === "lmstudio" && isAutoModelToken(config.providers.planner.model))
    ) {
      pushIssue(
        issues,
        "error",
        `Planner model is empty. Run \`${commandExample("setup")}\` to choose a model.`
      );
    }

    const dispatcherHealth = await checkProviderHealth(config.providers.dispatcher);
    if (!(dispatcherHealth.reachable && (dispatcherHealth.modelFound ?? true))) {
      pushIssue(issues, "error", `Dispatcher provider: ${providerHealthToHuman(dispatcherHealth.message)}`);
    }

    const plannerHealth = await checkProviderHealth(config.providers.planner);
    if (!(plannerHealth.reachable && (plannerHealth.modelFound ?? true))) {
      pushIssue(issues, "error", `Planner provider: ${providerHealthToHuman(plannerHealth.message)}`);
    }
  }

  return {
    ok: issues.every((issue) => issue.severity !== "error"),
    issues,
  };
}

export function printReadinessReport(report: ReadinessReport, title = "Readiness checks"): void {
  if (!report.issues.length) return;

  console.log(`\n${title}`);
  for (const issue of report.issues) {
    const marker = issue.severity === "error" ? "✗" : "!" ;
    console.log(`${marker} ${issue.message}`);
  }
}
