import { Command } from "commander";
import { ensureGlobalInitialized, ensureProjectInitialized } from "../lib/bootstrap.js";
import { createTask } from "../lib/task.js";
import { taskTypeSchema } from "../lib/schema.js";
import type { TaskType } from "../lib/types.js";
import { promptRequiredText, selectOption } from "../lib/interactive.js";
import { commandExample } from "../lib/cli-command.js";
import { collectReadinessReport, printReadinessReport } from "../lib/readiness.js";

export const newCommand = new Command("new")
  .description("Create a new task")
  .argument("[title]", "task title")
  .option("--type <type>", "task type")
  .option("--project <project>", "project name", "")
  .option("--raw <rawRequest>", "raw request override", "")
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
    let finalType = options.type as TaskType | undefined;

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

    const { taskId, taskPath } = await createTask({
      title: finalTitle!,
      typeHint: taskTypeSchema.parse(finalType!),
      project: options.project || "",
      rawRequest: options.raw || finalTitle!,
      extraContext: {
        relatedFiles: [],
        logs: [],
        notes: [],
      },
    });

    console.log("\nTask created.");
    console.log(`- Task ID: ${taskId}`);
    console.log(`- Path: ${taskPath}`);
    console.log("- The engine will process it automatically if `start` is already running.");
    console.log(`Next step: run \`${commandExample("status")}\` to follow progress.`);
  });
