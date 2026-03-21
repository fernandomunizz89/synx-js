import { Command } from "commander";
import { loadPipelineDefinition, loadPipelineDefinitions } from "../lib/pipeline-registry.js";
import type { PipelineStep } from "../lib/types.js";

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

export const pipelineCommand = new Command("pipeline")
  .description("Manage pipeline definitions")
  .addCommand(pipelineListCommand)
  .addCommand(pipelineShowCommand);
