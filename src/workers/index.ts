import { DispatcherWorker } from "./dispatcher.js";
import { SynxFrontExpert } from "./experts/synx-front-expert.js";
import { SynxMobileExpert } from "./experts/synx-mobile-expert.js";
import { SynxBackExpert } from "./experts/synx-back-expert.js";
import { SynxQAEngineer } from "./experts/synx-qa-engineer.js";
import { SynxSeoSpecialist } from "./experts/synx-seo-specialist.js";
import { GenericAgent } from "./generic-agent.js";
import { PipelineExecutor } from "./pipeline-executor.js";
import { loadAgentDefinitions } from "../lib/agent-registry.js";
import type { WorkerBase } from "./base.js";

export const workers = {
  dispatcher: new DispatcherWorker(),
  front: new SynxFrontExpert(),
  mobile: new SynxMobileExpert(),
  back: new SynxBackExpert(),
  qa: new SynxQAEngineer(),
  seo: new SynxSeoSpecialist(),
  pipelineExecutor: new PipelineExecutor(),
};

export const workerList: WorkerBase[] = Object.values(workers);

export async function registerCustomAgents(): Promise<void> {
  const definitions = await loadAgentDefinitions();
  for (const def of definitions) {
    workerList.push(new GenericAgent(def));
  }
}
