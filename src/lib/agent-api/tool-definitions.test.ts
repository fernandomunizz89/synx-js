import { describe, expect, it } from "vitest";
import { getOpenApiSpec, getToolDefinitions } from "./tool-definitions.js";

describe("agent-api/tool-definitions", () => {
  it("returns exactly 7 OpenAI tools", () => {
    const tools = getToolDefinitions();
    expect(tools).toHaveLength(7);
    expect(tools.every((tool) => tool.type === "function")).toBe(true);
    expect(tools.every((tool) => tool.function.name.startsWith("synx_"))).toBe(true);
  });

  it("returns an OpenAPI spec with required top-level keys", () => {
    const spec = getOpenApiSpec("http://localhost:4317");
    expect(spec).toHaveProperty("openapi");
    expect(spec).toHaveProperty("info");
    expect(spec).toHaveProperty("paths");
  });

  it("includes the expected path entries", () => {
    const spec = getOpenApiSpec("http://localhost:4317") as { paths: Record<string, unknown> };
    const paths = Object.keys(spec.paths || {});
    expect(paths).toHaveLength(10);
    expect(paths).toContain("/api/v1/agent/tasks");
    expect(paths).toContain("/api/v1/agent/tasks/pending-review");
    expect(paths).toContain("/api/v1/agent/tasks/{taskId}");
    expect(paths).toContain("/api/v1/agent/tasks/{taskId}/approve");
    expect(paths).toContain("/api/v1/agent/tasks/{taskId}/reprove");
    expect(paths).toContain("/api/v1/agent/status");
    expect(paths).toContain("/api/v1/agent/projects/{projectId}/graph");
    expect(paths).toContain("/api/v1/agent/contracts/webhooks");
    expect(paths).toContain("/api/v1/agent/contracts/events");
    expect(paths).toContain("/api/v1/agent/events/recent");
  });
});
