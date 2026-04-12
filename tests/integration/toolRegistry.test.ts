import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ToolRegistry } from "../../src/tools/registry.js";
import { createToolContext } from "../fixtures/runtime.js";
import { PermissionController } from "../../src/core/permission.js";
import { createDefaultToolRegistry } from "../../src/tools/registry.js";

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

  it("adds alias hint for str_replace schema errors", async () => {
    const registry = new ToolRegistry([
      {
        name: "str_replace",
        description: "replace text",
        schema: z.object({ path: z.string(), oldText: z.string(), newText: z.string() }),
        execute: async () => ({ ok: true, output: "ok" })
      }
    ]);

    const result = await registry.execute("str_replace", { path: "a.ts", old_str: "a", new_text: "b" }, createToolContext());

    expect(result.ok).toBe(false);
    expect(result.output).toContain("oldText");
    expect(result.output).toContain("newText");
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
    permission.questionController.setHandler(async () => "deny");

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
    permission.questionController.setHandler(async () => "allow_once");

    const result = await registry.execute("bash", { command: "echo test" }, createToolContext({ permission }));

    expect(result.ok).toBe(true);
    expect(result.output).toBe("true");
  });

  it("does not prompt for bash commands allowed by allow prefixes", async () => {
    let prompted = false;
    const registry = new ToolRegistry([
      {
        name: "bash",
        description: "bash",
        schema: z.object({ command: z.string(), confirmed: z.boolean().optional() }),
        execute: async ({ confirmed }) => ({ ok: true, output: String(confirmed ?? false) })
      }
    ]);

    const permission = new PermissionController();
    permission.questionController.setHandler(async () => {
      prompted = true;
      return "deny";
    });
    const context = createToolContext({ permission });
    context.runtimeConfig.sandbox.allowPrefixes = ["echo safe"];

    const result = await registry.execute("bash", { command: "echo safe" }, context);

    expect(result.ok).toBe(true);
    expect(result.output).toBe("false");
    expect(prompted).toBe(false);
  });

  it("passes a reason into permission prompts", async () => {
    const registry = new ToolRegistry([
      {
        name: "bash",
        description: "bash",
        schema: z.object({ command: z.string(), confirmed: z.boolean().optional() }),
        execute: async () => ({ ok: true, output: "ok" })
      }
    ]);

    const permission = new PermissionController();
    let reason = "";
    permission.questionController.setHandler(async (request) => {
      reason = request.body ?? "";
      return "allow_once";
    });

    const result = await registry.execute("bash", { command: "echo test" }, createToolContext({ permission }));

    expect(result.ok).toBe(true);
    expect(reason).toContain("approval");
  });

  it("does not prompt for mutating file tools", async () => {
    let prompted = false;
    const registry = new ToolRegistry([
      {
        name: "create",
        description: "create",
        capabilities: ["mutating"],
        schema: z.object({ path: z.string() }),
        execute: async () => ({ ok: true, output: "ok" })
      }
    ]);

    const permission = new PermissionController();
    permission.questionController.setHandler(async () => {
      prompted = true;
      return "deny";
    });

    const result = await registry.execute("create", { path: "file.txt" }, createToolContext({ permission }));

    expect(result.ok).toBe(true);
    expect(prompted).toBe(false);
  });

  it("executes ask_user_question through the shared question controller", async () => {
    const registry = new ToolRegistry([
      {
        name: "ask_user_question",
        description: "ask the user a question",
        schema: z.object({
          title: z.string(),
          options: z.array(z.object({
            value: z.string(),
            label: z.string(),
            shortcutKey: z.string().optional()
          })).min(1)
        }),
        execute: async (input, context) => {
          if (!context.askUserQuestion) {
            return { ok: false, output: "missing controller" };
          }
          const answer = await context.askUserQuestion.ask(input);
          return { ok: true, output: answer };
        }
      }
    ]);

    const permission = new PermissionController();
    permission.questionController.setHandler(async () => "allow_once");

    const result = await registry.execute("ask_user_question", {
      title: "Proceed?",
      options: [
        { value: "allow_once", label: "Allow once", shortcutKey: "y" },
        { value: "deny", label: "Deny", shortcutKey: "n" }
      ]
    }, createToolContext({ askUserQuestion: permission.questionController }));

    expect(result.ok).toBe(true);
    expect(result.output).toBe("allow_once");
  });

  it("default registry includes remember and forget tools", () => {
    const registry = createDefaultToolRegistry();

    expect(registry.getToolByName("remember")).toBeTruthy();
    expect(registry.getToolByName("forget")).toBeTruthy();
  });
});
