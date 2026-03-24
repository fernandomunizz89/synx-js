import path from "node:path";
import { exists, readJson, writeJson } from "./fs.js";
import { taskDir } from "./paths.js";

export const ARTIFACT_FILES = {
  projectProfile: "project-profile.json",
  projectDecomposition: "project-decomposition.json",
  projectBrief: "project-brief.json",
  acceptanceCriteria: "acceptance-criteria.json",
  milestonePlan: "milestone-plan.json",
  clarificationRequest: "clarification-request.json",
  dispatcherRouting: "dispatcher-routing.json",
  bugBrief: "bug-brief.json",
  featureBrief: "feature-brief.json",
  symbolContract: "symbol-contract.json",
  researchLog: "research-log.json",
  researchContext: "research-context.json",
  agentConsultationLog: "agent-consultation-log.json",
} as const;

function artifactPath(taskId: string, fileName: string): string {
  return path.join(taskDir(taskId), "artifacts", fileName);
}

export async function saveTaskArtifact(taskId: string, fileName: string, payload: unknown): Promise<void> {
  await writeJson(artifactPath(taskId, fileName), payload);
}

export async function loadTaskArtifact<T>(taskId: string, fileName: string): Promise<T | null> {
  const targetPath = artifactPath(taskId, fileName);
  if (!(await exists(targetPath))) return null;
  try {
    return await readJson<T>(targetPath);
  } catch {
    return null;
  }
}
