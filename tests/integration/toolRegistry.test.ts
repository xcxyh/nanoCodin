import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ToolRegistry } from "../../src/tools/registry.js";
import { createToolContext } from "../fixtures/runtime.js";

describe("ToolRegistry.execute", () => {
  it("returns unknown tool error", async () => {
    const registry = new ToolRegistry([]);
    const result = await registry.execute("missing", {}, createToolContext());

    expect(result.ok).toBe(false);
    expect(result.output).toContain("Unknown tool: missing");
  });

  it("returns schema validation error", async () => {
    const registry = new ToolRegistry([
      {
        name: "echo",
        description: "echo",
        schema: z.object({ text: z.string().min(1) }),
        execute: async ({ text }) => ({ ok: true, output: text })
      }
    ]);

    const result = await registry.execute("echo", { text: "" }, createToolContext());

    expect(result.ok).toBe(false);
    expect(result.output).toContain("Invalid input for tool echo");
  });

  it("supports inline tool + json payload in action string", async () => {
    const registry = new ToolRegistry([
      {
        name: "echo",
        description: "echo",
        schema: z.object({ text: z.string().min(1) }),
        execute: async ({ text }) => ({ ok: true, output: text })
      }
    ]);

    const result = await registry.execute("echo {\"text\":\"hello\"}", {}, createToolContext());

    expect(result.ok).toBe(true);
    expect(result.output).toBe("hello");
  });
});
