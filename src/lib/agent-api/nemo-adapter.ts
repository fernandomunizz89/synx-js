import { approveTaskService, createTaskService, reproveTaskService } from "../services/task-services.js";
import { getOverview, getTaskDetail, listReviewQueue, listTaskSummaries } from "../observability/queries.js";
import { buildObservation } from "./observation.js";

export interface NemoActionDescriptor {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
}

export interface NemoActionOptions {
  enableMutations: boolean;
}

const NEMO_ACTIONS: NemoActionDescriptor[] = [
  {
    name: "synx_create_task",
    description: "Create a task and return an observation envelope.",
    parameters: {
      title: { type: "string", description: "Task title", required: true },
      rawRequest: { type: "string", description: "Detailed task request", required: true },
      typeHint: { type: "string", description: "Task type hint" },
      project: { type: "string", description: "Optional project name" },
      relatedFiles: { type: "array", description: "Optional related file paths" },
      notes: { type: "array", description: "Optional notes" },
      e2ePolicy: { type: "string", description: "Optional E2E policy" },
    },
  },
  {
    name: "synx_get_task",
    description: "Get task observation by id.",
    parameters: {
      taskId: { type: "string", description: "Task id", required: true },
    },
  },
  {
    name: "synx_list_tasks",
    description: "List tasks with optional status/project/query filters.",
    parameters: {
      status: { type: "string", description: "Optional status filter" },
      project: { type: "string", description: "Optional project filter" },
      q: { type: "string", description: "Optional text query" },
    },
  },
  {
    name: "synx_approve_task",
    description: "Approve a waiting task.",
    parameters: {
      taskId: { type: "string", description: "Task id", required: true },
    },
  },
  {
    name: "synx_reprove_task",
    description: "Reprove a waiting task with a reason.",
    parameters: {
      taskId: { type: "string", description: "Task id", required: true },
      reason: { type: "string", description: "Actionable feedback", required: true },
    },
  },
  {
    name: "synx_list_pending_review",
    description: "List tasks pending review.",
    parameters: {},
  },
  {
    name: "synx_get_status",
    description: "Get overall SYNX runtime and queue status.",
    parameters: {},
  },
];

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asString(item)).filter(Boolean);
}

function isMutationAction(actionName: string): boolean {
  return actionName === "synx_create_task"
    || actionName === "synx_approve_task"
    || actionName === "synx_reprove_task";
}

function normalizeTaskType(value: string): "Feature" | "Bug" | "Refactor" | "Research" | "Documentation" | "Mixed" | "Project" {
  if (value === "Bug" || value === "Refactor" || value === "Research" || value === "Documentation" || value === "Mixed" || value === "Project") {
    return value;
  }
  return "Feature";
}

export function listNemoActions(): NemoActionDescriptor[] {
  return [...NEMO_ACTIONS];
}

export async function dispatchNemoAction(
  actionName: string,
  parameters: Record<string, unknown>,
  options: NemoActionOptions,
): Promise<{ output_data: Record<string, unknown> }> {
  if (!options.enableMutations && isMutationAction(actionName)) {
    return { output_data: { ok: false, error: "Mutations disabled." } };
  }

  if (actionName === "synx_create_task") {
    const title = asString(parameters.title);
    const rawRequest = asString(parameters.rawRequest);
    if (!title || !rawRequest) {
      return { output_data: { ok: false, error: "title and rawRequest are required." } };
    }
    const typeHint = asString(parameters.typeHint) || "Feature";
    const project = asString(parameters.project) || undefined;
    const e2ePolicy = asString(parameters.e2ePolicy);
    const created = await createTaskService({
      title,
      rawRequest,
      typeHint: normalizeTaskType(typeHint),
      project,
      extraContext: {
        relatedFiles: asStringList(parameters.relatedFiles),
        logs: [],
        notes: asStringList(parameters.notes),
        qaPreferences: {
          e2ePolicy: (e2ePolicy === "required" || e2ePolicy === "skip" || e2ePolicy === "auto") ? e2ePolicy : "auto",
        },
      },
    });
    const detail = await getTaskDetail(created.taskId);
    return { output_data: buildObservation(detail, created.taskId) as unknown as Record<string, unknown> };
  }

  if (actionName === "synx_get_task") {
    const taskId = asString(parameters.taskId);
    if (!taskId) return { output_data: { ok: false, error: "taskId is required." } };
    const detail = await getTaskDetail(taskId);
    return { output_data: buildObservation(detail, taskId) as unknown as Record<string, unknown> };
  }

  if (actionName === "synx_list_tasks") {
    const status = asString(parameters.status);
    const project = asString(parameters.project);
    const query = asString(parameters.q).toLowerCase();
    let tasks = await listTaskSummaries();
    if (status) tasks = tasks.filter((task) => task.status === status);
    if (project) tasks = tasks.filter((task) => task.project === project);
    if (query) {
      tasks = tasks.filter((task) =>
        task.taskId.toLowerCase().includes(query)
        || task.title.toLowerCase().includes(query)
        || task.project.toLowerCase().includes(query));
    }
    return { output_data: { ok: true, data: tasks } };
  }

  if (actionName === "synx_approve_task") {
    const taskId = asString(parameters.taskId);
    if (!taskId) return { output_data: { ok: false, error: "taskId is required." } };
    await approveTaskService(taskId);
    const detail = await getTaskDetail(taskId);
    return { output_data: buildObservation(detail, taskId) as unknown as Record<string, unknown> };
  }

  if (actionName === "synx_reprove_task") {
    const taskId = asString(parameters.taskId);
    const reason = asString(parameters.reason);
    if (!taskId || !reason) return { output_data: { ok: false, error: "taskId and reason are required." } };
    await reproveTaskService({ taskId, reason });
    const detail = await getTaskDetail(taskId);
    return { output_data: buildObservation(detail, taskId) as unknown as Record<string, unknown> };
  }

  if (actionName === "synx_list_pending_review") {
    const queue = await listReviewQueue();
    return { output_data: { ok: true, data: queue } };
  }

  if (actionName === "synx_get_status" || actionName === "synx_get_system_status") {
    const overview = await getOverview();
    return { output_data: { ok: true, data: overview } };
  }

  return { output_data: { ok: false, error: `Unknown action: ${actionName}` } };
}

export function generateColangSample(baseUrl: string): string {
  const actionNames = listNemoActions().map((action) => action.name);
  return actionNames.map((actionName) => {
    return [
      `define action ${actionName}`,
      "  http_request:",
      `    url: "${baseUrl}/api/v1/nemo/actions/${actionName}"`,
      "    method: POST",
      "    headers:",
      '      Content-Type: "application/json"',
      "    body: $action_params",
      "",
    ].join("\n");
  }).join("\n");
}
