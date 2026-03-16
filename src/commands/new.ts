import { Command } from "commander";
import { ensureGlobalInitialized, ensureProjectInitialized } from "../lib/bootstrap.js";
import { createTask } from "../lib/task.js";
import { taskTypeSchema } from "../lib/schema.js";
import type { E2EFramework, E2EPolicy, TaskType } from "../lib/types.js";
import { promptRequiredText, selectOption } from "../lib/interactive.js";
import { commandExample } from "../lib/cli-command.js";
import { collectReadinessReport, printReadinessReport } from "../lib/readiness.js";
import { resolveTaskQaPreferences } from "../lib/qa-preferences.js";

function parseTaskType(value: string | undefined): TaskType | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "feature" || normalized === "feat" || normalized === "featute") return "Feature";
  if (normalized === "bug") return "Bug";
  if (normalized === "refactor" || normalized === "refactoring") return "Refactor";
  if (normalized === "research") return "Research";
  if (normalized === "documentation" || normalized === "docs" || normalized === "doc") return "Documentation";
  if (normalized === "mixed") return "Mixed";
  throw new Error(`Invalid --type value "${value}". Use: Feature | Bug | Refactor | Research | Documentation | Mixed`);
}

function parseE2EPolicy(value: string | undefined): E2EPolicy | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "auto") return "auto";
  if (normalized === "required" || normalized === "yes" || normalized === "on" || normalized === "true") return "required";
  if (normalized === "skip" || normalized === "disabled" || normalized === "no" || normalized === "off" || normalized === "false") return "skip";
  throw new Error(`Invalid --e2e value "${value}". Use: auto | required | skip`);
}

function parseE2EFramework(value: string | undefined): E2EFramework | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "auto" || normalized === "playwright" || normalized === "other") {
    return normalized;
  }
  throw new Error(`Invalid --e2e-framework value "${value}". Use: auto | playwright | other`);
}

export const newCommand = new Command("new")
  .description("Create a new task")
  .argument("[title]", "task title")
  .option("--type <type>", "task type")
  .option("--project <project>", "project name", "")
  .option("--raw <rawRequest>", "raw request override", "")
  .option("--e2e <policy>", "E2E policy: auto | required | skip")
  .option("--e2e-framework <framework>", "Preferred E2E framework: auto | playwright | other")
  .option("--qa-objective <objective>", "Explicit QA objective for this task")
  .action(async (title: string | undefined, options) => {
    await ensureGlobalInitialized();
    await ensureProjectInitialized();
    const readiness = await collectReadinessReport({ includeProviderChecks: true });
    printReadinessReport(readiness, "Readiness checks");
    if (!readiness.ok) {
      console.log(`\nTask creation will continue, but processing may fail until setup is fixed.`);
      console.log(`Recommended now: \`${commandExample("setup")}\`.`);
    }

    let finalTitle = title;
    let finalType = parseTaskType(options.type);

    if (!finalTitle || !finalType) {
      finalTitle = finalTitle || (await promptRequiredText("Task title (required):"));
      finalType = finalType || (await selectOption<TaskType>(
        "Choose task type",
        [
          { value: "Feature", label: "Feature" },
          { value: "Bug", label: "Bug" },
          { value: "Refactor", label: "Refactor" },
          { value: "Research", label: "Research" },
          { value: "Documentation", label: "Documentation" },
          { value: "Mixed", label: "Mixed" },
        ],
        "Feature"
      ));
    }

    let e2ePolicy = parseE2EPolicy(options.e2e);
    if (!e2ePolicy) {
      const recommendedPolicy = ["Feature", "Bug", "Refactor", "Mixed"].includes(finalType!) ? "required" : "auto";
      e2ePolicy = await selectOption<E2EPolicy>(
        "E2E policy for this task",
        [
          {
            value: "required",
            label: "Required (Recommended)",
            description: "QA must validate E2E and remediation agents must fix/generate E2E as needed.",
          },
          {
            value: "skip",
            label: "Skip E2E",
            description: "Do not require E2E generation/execution for this task.",
          },
          {
            value: "auto",
            label: "Auto",
            description: "Use pipeline defaults based on task type.",
          },
        ],
        recommendedPolicy as E2EPolicy,
      );
    }

    let e2eFramework = parseE2EFramework(options.e2eFramework);
    if (!e2eFramework) {
      const recommendedFramework: E2EFramework = "auto";
      e2eFramework = await selectOption<E2EFramework>(
        "Preferred E2E framework",
        [
          { value: "playwright", label: "Playwright" },
          { value: "auto", label: "Auto detect" },
          { value: "other", label: "Other framework" },
        ],
        recommendedFramework,
      );
    }

    const rawRequest = options.raw || finalTitle!;
    const draftTaskInput = {
      title: finalTitle!,
      typeHint: taskTypeSchema.parse(finalType!),
      project: options.project || "",
      rawRequest,
      extraContext: {
        relatedFiles: [],
        logs: [],
        notes: [],
        qaPreferences: {
          e2ePolicy,
          e2eFramework,
          objective: (options.qaObjective || "").trim(),
        },
      },
    };
    const resolvedPreferences = resolveTaskQaPreferences(draftTaskInput);
    const { taskId, taskPath } = await createTask({
      ...draftTaskInput,
      extraContext: {
        ...draftTaskInput.extraContext,
        qaPreferences: {
          ...draftTaskInput.extraContext.qaPreferences,
          objective: resolvedPreferences.objective,
        },
      },
    });

    console.log("\nTask created.");
    console.log(`- Task ID: ${taskId}`);
    console.log(`- Path: ${taskPath}`);
    console.log(`- QA objective: ${resolvedPreferences.objective}`);
    console.log(`- E2E policy: ${resolvedPreferences.e2ePolicy} | framework: ${resolvedPreferences.e2eFramework}`);
    console.log("- The engine will process it automatically if `start` is already running.");
    console.log(`Next step: run \`${commandExample("status")}\` to follow progress.`);
  });
