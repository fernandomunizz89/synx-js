import { describe, expect, it } from "vitest";
import { MockProvider } from "./mock-provider.js";

describe("providers/mock-provider", () => {
  it("returns mock response for Synx QA Engineer", async () => {
    const provider = new MockProvider("m1");
    const res = await provider.generateStructured({ agent: "Synx QA Engineer", taskId: "t", input: {} } as any);
    expect(res.parsed).toHaveProperty("verdict", "pass");
  });

  it("returns mock response for Human Review", async () => {
    const provider = new MockProvider("m1");
    const res = await provider.generateStructured({ agent: "Human Review", taskId: "t", input: {} } as any);
    expect(res.parsed).toHaveProperty("accepted", true);
  });

  it("returns empty object for unknown agent", async () => {
    const provider = new MockProvider("m1");
    const res = await provider.generateStructured({ agent: "UnknownAgent" as any, taskId: "t", input: {} } as any);
    expect(res.parsed).toEqual({});
  });

  it("routes bug tasks from Dispatcher to Synx Front Expert", async () => {
    const provider = new MockProvider("mock-v1");
    const result = await provider.generateStructured({
      agent: "Dispatcher",
      systemPrompt: "x",
      input: {
        typeHint: "Bug",
        title: "Fix timer import",
        rawRequest: "SyntaxError",
        project: "my-pomodoro",
      },
      expectedJsonSchemaDescription: "{}",
    });

    const parsed = result.parsed as { type: string; nextAgent: string };
    expect(parsed.type).toBe("Bug");
    expect(parsed.nextAgent).toBe("Synx Front Expert");
    expect(result.provider).toBe("mock");
    expect(result.model).toBe("mock-v1");
  });

  it("returns implementation edits for Synx Front Expert stage", async () => {
    const provider = new MockProvider("mock-v1");
    const result = await provider.generateStructured({
      agent: "Synx Front Expert",
      systemPrompt: "x",
      input: {
        task: {
          typeHint: "Feature",
          title: "Increase title size",
        },
      },
      expectedJsonSchemaDescription: "{}",
    });

    const parsed = result.parsed as { filesChanged: string[]; edits: Array<{ path: string; action: string }> };
    expect(parsed.filesChanged).toContain("mock-change.txt");
    expect(parsed.edits).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "mock-change.txt", action: "replace" }),
      expect.objectContaining({ path: "mock-change.test.txt", action: "replace" }),
    ]));
    expect(result.validationPassed).toBe(true);
  });
});
