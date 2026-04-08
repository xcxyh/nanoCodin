import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildAiSdkToolSet, FINAL_TOOL_NAME } from "../../src/llm/aiSdkTools.js";
import { ToolRegistry } from "../../src/tools/registry.js";

describe("buildAiSdkToolSet", () => {
  it("maps nano tools to AI SDK tools without execute functions", () => {
    const schema = z.object({ text: z.string() });
    const registry = new ToolRegistry([
      {
        name: "echo",
        description: "Echo text",
        schema,
        execute: async ({ text }) => ({ ok: true, output: text })
      }
    ]);

    const tools = buildAiSdkToolSet(registry);

    expect(tools.echo?.description).toBe("Echo text");
    expect(tools.echo?.parameters).toBe(schema);
    expect(tools.echo?.execute).toBeUndefined();
    expect(tools[FINAL_TOOL_NAME]?.parameters).toBeDefined();
    expect(tools[FINAL_TOOL_NAME]?.execute).toBeUndefined();
  });

  it("rejects registries that already define the reserved final tool", () => {
    const registry = new ToolRegistry([
      {
        name: FINAL_TOOL_NAME,
        description: "reserved",
        schema: z.object({}),
        execute: async () => ({ ok: true, output: "ok" })
      }
    ]);

    expect(() => buildAiSdkToolSet(registry)).toThrow("reserved");
  });
});
