import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ToolRegistry } from "../../src/tools/registry.js";
import { createToolContext } from "../fixtures/runtime.js";
import { PermissionController } from "../../src/core/permission.js";

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

  it("denies bash execution when user rejects permission", async () => {
    let executed = false;
    const registry = new ToolRegistry([
      {
        name: "bash",
        description: "bash",
        schema: z.object({ command: z.string(), confirmed: z.boolean().optional() }),
        execute: async () => {
          executed = true;
          return { ok: true, output: "ran" };
        }
      }
    ]);

    const permission = new PermissionController();
    permission.setPromptHandler(async () => "deny");

    const result = await registry.execute("bash", { command: "echo test" }, createToolContext({ permission }));

    expect(result.ok).toBe(false);
    expect(result.output).toContain("Permission denied by user");
    expect(executed).toBe(false);
  });

  it("injects confirmed flag when user allows bash execution", async () => {
    const registry = new ToolRegistry([
      {
        name: "bash",
        description: "bash",
        schema: z.object({ command: z.string(), confirmed: z.boolean().optional() }),
        execute: async ({ confirmed }) => ({ ok: true, output: String(confirmed) })
      }
    ]);

    const permission = new PermissionController();
    permission.setPromptHandler(async () => "allow_once");

    const result = await registry.execute("bash", { command: "echo test" }, createToolContext({ permission }));

    expect(result.ok).toBe(true);
    expect(result.output).toBe("true");
  });
});
