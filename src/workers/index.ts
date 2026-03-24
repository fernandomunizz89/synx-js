import { DispatcherWorker } from "./dispatcher.js";
import { SynxFrontExpert } from "./experts/synx-front-expert.js";
import { SynxMobileExpert } from "./experts/synx-mobile-expert.js";
import { SynxBackExpert } from "./experts/synx-back-expert.js";
import { SynxDevopsExpert } from "./experts/synx-devops-expert.js";
import { SynxCodeReviewer } from "./experts/synx-code-reviewer.js";
import { SynxQAEngineer } from "./experts/synx-qa-engineer.js";
import { SynxSeoSpecialist } from "./experts/synx-seo-specialist.js";
import { SynxSecurityAuditor } from "./experts/synx-security-auditor.js";
import { SynxDocsWriter } from "./experts/synx-docs-writer.js";
import { SynxDbArchitect } from "./experts/synx-db-architect.js";
import { SynxPerformanceOptimizer } from "./experts/synx-performance-optimizer.js";
import { SynxReleaseManager } from "./experts/synx-release-manager.js";
import { SynxIncidentTriage } from "./experts/synx-incident-triage.js";
import { SynxCustomerFeedbackSynthesizer } from "./experts/synx-customer-feedback-synthesizer.js";
import { GenericAgent } from "./generic-agent.js";
import { PipelineExecutor } from "./pipeline-executor.js";
import { ProjectOrchestrator } from "./project-orchestrator.js";
import { loadAgentDefinitions } from "../lib/agent-registry.js";
import type { WorkerBase } from "./base.js";

export const workers = {
  projectOrchestrator: new ProjectOrchestrator(),
  dispatcher: new DispatcherWorker(),
  front: new SynxFrontExpert(),
  mobile: new SynxMobileExpert(),
  back: new SynxBackExpert(),
  devops: new SynxDevopsExpert(),
  codeReviewer: new SynxCodeReviewer(),
  qa: new SynxQAEngineer(),
  seo: new SynxSeoSpecialist(),
  securityAuditor: new SynxSecurityAuditor(),
  docsWriter: new SynxDocsWriter(),
  dbArchitect: new SynxDbArchitect(),
  perfOptimizer: new SynxPerformanceOptimizer(),
  releaseManager: new SynxReleaseManager(),
  incidentTriage: new SynxIncidentTriage(),
  customerFeedbackSynthesizer: new SynxCustomerFeedbackSynthesizer(),
  pipelineExecutor: new PipelineExecutor(),
};

export const workerList: WorkerBase[] = Object.values(workers);

export async function registerCustomAgents(): Promise<void> {
  const definitions = await loadAgentDefinitions();
  for (const def of definitions) {
    workerList.push(new GenericAgent(def));
  }
}
