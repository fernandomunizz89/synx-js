import path from "node:path";
import { Command } from "commander";
import { ensureGlobalInitialized, ensureProjectInitialized } from "../lib/bootstrap.js";
import { writeJson } from "../lib/fs.js";
import { taskDir } from "../lib/paths.js";
import { loadPipelineDefinition, loadPipelineDefinitions } from "../lib/pipeline-registry.js";
import { PIPELINE_EXECUTOR_STAGE_FILE } from "../lib/constants.js";
import { ensureTaskStructure } from "../lib/task.js";
import type { PipelineStep, StageEnvelope } from "../lib/types.js";
import { nowIso, randomId, slugify, todayDate } from "../lib/utils.js";

function printStep(step: PipelineStep, index: number): void {
  const parts = [`  Step ${index + 1}: ${step.agent}`];
  if (step.providerOverride) {
    parts.push(`    Provider override: ${step.providerOverride}`);
  }
  if (step.condition) {
    parts.push(`    Condition: ${step.condition}`);
  }
  if (step.defaultNextStep !== undefined) {
    parts.push(`    Default next step: ${step.defaultNextStep}`);
  }
  console.log(parts.join("\n"));
}

const pipelineListCommand = new Command("list")
  .description("List all pipeline definitions")
  .action(async () => {
    let pipelines;
    try {
      pipelines = await loadPipelineDefinitions();
    } catch {
      console.log("No pipelines defined yet.");
      return;
    }

    if (pipelines.length === 0) {
      console.log("No pipelines defined yet.");
      return;
    }

    console.log("\nPipelines");
    for (const pipeline of pipelines) {
      console.log(`\n${pipeline.id}`);
      console.log(`- Name: ${pipeline.name}`);
      console.log(`- Routing: ${pipeline.routing}`);
      console.log(`- Steps: ${pipeline.steps.length}`);
    }
  });

const pipelineShowCommand = new Command("show")
  .description("Show details of a pipeline definition")
  .argument("<id>", "Pipeline ID")
  .action(async (id: string) => {
    let pipeline;
    try {
      pipeline = await loadPipelineDefinition(id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(1);
    }

    console.log(`\n${pipeline.id}`);
    console.log(`- Name: ${pipeline.name}`);
    if (pipeline.description) {
      console.log(`- Description: ${pipeline.description}`);
    }
    console.log(`- Routing: ${pipeline.routing}`);
    console.log(`- Steps (${pipeline.steps.length}):`);
    for (let i = 0; i < pipeline.steps.length; i++) {
      printStep(pipeline.steps[i], i);
    }
  });

const pipelineRunCommand = new Command("run")
  .description("Run a pipeline with the given input")
  .argument("<id>", "Pipeline ID")
  .argument("<input>", "Detailed input describing what to do")
  .option("--type <type>", "task type hint", "Feature")
  .action(async (id: string, input: string, options) => {
    await ensureGlobalInitialized();
    await ensureProjectInitialized();

    let pipeline;
    try {
      pipeline = await loadPipelineDefinition(id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(1);
    }

    const taskId = `task-${todayDate()}-${randomId(4)}-${slugify(input.slice(0, 40))}`;
    const dir = taskDir(taskId);
    await ensureTaskStructure(dir);

    const taskInput = {
      title: input.slice(0, 120),
      typeHint: options.type,
      project: "",
      rawRequest: input,
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    };

    const pipelineState = {
      pipelineId: id,
      currentStep: 0,
      completedSteps: [],
    };

    await writeJson(path.join(dir, "input", "new-task.json"), taskInput);
    await writeJson(path.join(dir, "input", "pipeline-state.json"), pipelineState);
    await writeJson(path.join(dir, "inbox", PIPELINE_EXECUTOR_STAGE_FILE), {
      taskId,
      stage: "pipeline-executor",
      status: "request",
      createdAt: nowIso(),
      agent: "Pipeline Executor",
      inputRef: "input/pipeline-state.json",
    } satisfies StageEnvelope);

    console.log(`\nPipeline task created.`);
    console.log(`- Task ID: ${taskId}`);
    console.log(`- Pipeline: ${pipeline.name} (${pipeline.routing}, ${pipeline.steps.length} steps)`);
    console.log(`- Path: ${dir}`);
    console.log("- Run `synx start` to begin processing.");
  });

export const pipelineCommand = new Command("pipeline")
  .description("Manage pipeline definitions")
  .addCommand(pipelineListCommand)
  .addCommand(pipelineShowCommand)
  .addCommand(pipelineRunCommand);
