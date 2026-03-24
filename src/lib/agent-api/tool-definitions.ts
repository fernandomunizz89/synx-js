export interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: object;
  };
}

const TASK_TYPE_ENUM = ["Feature", "Bug", "Refactor", "Research", "Documentation", "Mixed", "Project"] as const;
const E2E_POLICY_ENUM = ["auto", "required", "skip"] as const;
const TASK_STATUS_ENUM = ["new", "in_progress", "waiting_agent", "waiting_human", "blocked", "failed", "done", "archived"] as const;

export function getToolDefinitions(): OpenAITool[] {
  return [
    {
      type: "function",
      function: {
        name: "synx_create_task",
        description: "Create a new SYNX task and return its observation envelope.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short task title." },
            rawRequest: { type: "string", description: "Detailed task description." },
            typeHint: { type: "string", enum: TASK_TYPE_ENUM, default: "Feature" },
            project: { type: "string", description: "Optional project name." },
            relatedFiles: { type: "array", items: { type: "string" } },
            notes: { type: "array", items: { type: "string" } },
            e2ePolicy: { type: "string", enum: E2E_POLICY_ENUM, default: "auto" },
          },
          required: ["title", "rawRequest"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "synx_get_task",
        description: "Get a task observation by task id.",
        parameters: {
          type: "object",
          properties: {
            taskId: { type: "string", description: "Task identifier." },
          },
          required: ["taskId"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "synx_list_tasks",
        description: "List tasks with optional status/project/query filtering.",
        parameters: {
          type: "object",
          properties: {
            status: { type: "string", enum: TASK_STATUS_ENUM },
            project: { type: "string" },
            q: { type: "string" },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "synx_approve_task",
        description: "Approve a waiting task.",
        parameters: {
          type: "object",
          properties: {
            taskId: { type: "string", description: "Task identifier." },
          },
          required: ["taskId"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "synx_reprove_task",
        description: "Send a task back for revision with a reason.",
        parameters: {
          type: "object",
          properties: {
            taskId: { type: "string", description: "Task identifier." },
            reason: { type: "string", description: "Actionable feedback for remediation." },
          },
          required: ["taskId", "reason"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "synx_list_pending_review",
        description: "List tasks currently pending human approval.",
        parameters: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "synx_get_system_status",
        description: "Get overall SYNX runtime and workload status.",
        parameters: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },
    },
  ];
}

export function getOpenApiSpec(baseUrl: string): Record<string, unknown> {
  return {
    openapi: "3.0.3",
    info: {
      title: "synx Agent API",
      version: "1.0.0",
      description: "Versioned external control plane for SYNX orchestrators and tool clients.",
    },
    servers: [{ url: baseUrl }],
    paths: {
      "/api/v1/agent/tasks": {
        get: {
          summary: "List tasks",
          parameters: [
            { in: "query", name: "status", schema: { type: "string", enum: TASK_STATUS_ENUM } },
            { in: "query", name: "project", schema: { type: "string" } },
            { in: "query", name: "q", schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "Task list response" },
          },
        },
        post: {
          summary: "Create task",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    rawRequest: { type: "string" },
                    typeHint: { type: "string", enum: TASK_TYPE_ENUM },
                    project: { type: "string" },
                    relatedFiles: { type: "array", items: { type: "string" } },
                    notes: { type: "array", items: { type: "string" } },
                    e2ePolicy: { type: "string", enum: E2E_POLICY_ENUM },
                  },
                  required: ["title", "rawRequest"],
                },
              },
            },
          },
          responses: {
            "201": { description: "Observation response for created task" },
            "400": { description: "Validation error" },
          },
        },
      },
      "/api/v1/agent/tasks/pending-review": {
        get: {
          summary: "List tasks pending review",
          responses: {
            "200": { description: "Pending review tasks" },
          },
        },
      },
      "/api/v1/agent/tasks/{taskId}": {
        get: {
          summary: "Get task observation",
          parameters: [
            { in: "path", name: "taskId", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "Task observation response" },
            "404": { description: "Task not found" },
          },
        },
      },
      "/api/v1/agent/tasks/{taskId}/approve": {
        post: {
          summary: "Approve task",
          parameters: [
            { in: "path", name: "taskId", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "Task observation after approval" },
            "405": { description: "Mutations disabled" },
          },
        },
      },
      "/api/v1/agent/tasks/{taskId}/reprove": {
        post: {
          summary: "Reprove task",
          parameters: [
            { in: "path", name: "taskId", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    reason: { type: "string" },
                  },
                  required: ["reason"],
                },
              },
            },
          },
          responses: {
            "200": { description: "Task observation after reproval" },
            "400": { description: "Invalid reason" },
            "405": { description: "Mutations disabled" },
          },
        },
      },
      "/api/v1/agent/status": {
        get: {
          summary: "Get system status",
          responses: {
            "200": { description: "System overview observation envelope" },
          },
        },
      },
      "/api/v1/agent/projects/{projectId}/graph": {
        get: {
          summary: "Get project dependency graph snapshot",
          parameters: [
            { in: "path", name: "projectId", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "Project graph response" },
            "404": { description: "Project not found" },
          },
        },
      },
      "/api/v1/agent/contracts/webhooks": {
        get: {
          summary: "Get webhook contract",
          responses: {
            "200": { description: "Webhook contract response" },
          },
        },
      },
      "/api/v1/agent/contracts/events": {
        get: {
          summary: "Get runtime event contract",
          responses: {
            "200": { description: "Runtime event contract response" },
          },
        },
      },
      "/api/v1/agent/events/recent": {
        get: {
          summary: "List recent runtime events",
          parameters: [
            { in: "query", name: "limit", schema: { type: "integer", minimum: 1, maximum: 500, default: 100 } },
          ],
          responses: {
            "200": { description: "Recent runtime events response" },
          },
        },
      },
    },
  };
}
