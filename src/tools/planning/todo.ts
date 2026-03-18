import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Tool, TodoItem } from "../../core/toolTypes.js";

const schema = z.object({
  operation: z.enum(["create_todo_list", "update_todo_item", "mark_complete"]).optional(),
  items: z.array(z.string()).optional(),
  verificationPlan: z.array(z.string()).optional(),
  id: z.string().optional(),
  content: z.string().optional()
});

type Input = z.infer<typeof schema>;

function renderTodos(items: TodoItem[]): string {
  if (items.length === 0) {
    return "Todo list is empty.";
  }
  return items
    .map((item) => `- [${item.completed ? "x" : " "}] ${item.id} ${item.content}`)
    .join("\n");
}

function renderVerificationPlan(verificationPlan: string[]): string {
  if (verificationPlan.length === 0) {
    return "Verification plan: (none)";
  }
  return `Verification plan: ${verificationPlan.join(" | ")}`;
}

function renderSubtaskResults(results: { task: string; summary: string }[]): string {
  if (results.length === 0) {
    return "Subtask results: (none)";
  }
  return [
    "Subtask results:",
    ...results.map((result, index) => `${index + 1}. ${result.task} -> ${result.summary}`)
  ].join("\n");
}

function renderTodoState(context: Parameters<Tool<Input>["execute"]>[1]): string {
  return [
    renderTodos(context.todos.items),
    renderVerificationPlan(context.todos.verificationPlan),
    renderSubtaskResults(context.todos.taskBundle.results)
  ].join("\n");
}

export const todoTool: Tool<Input> = {
  name: "todo",
  description: "Manage in-memory todo list for planning",
  schema,
  execute: async (input, context) => {
    // Tolerant inference for partial model outputs:
    // - {} -> show current todos
    // - items -> create_todo_list
    // - id + content -> update_todo_item
    // - id -> mark_complete
    const inferredOperation = input.operation
      ?? (input.items ? "create_todo_list" : undefined)
      ?? (input.id && input.content ? "update_todo_item" : undefined)
      ?? (input.id ? "mark_complete" : undefined);

    if (!inferredOperation) {
      return { ok: true, output: renderTodoState(context) };
    }

    if (inferredOperation === "create_todo_list") {
      const items = input.items ?? [];
      context.todos.items = items.map((content) => ({
        id: randomUUID().slice(0, 8),
        content,
        completed: false
      }));
      context.todos.verificationPlan = input.verificationPlan ?? context.todos.verificationPlan;
      context.todos.taskBundle.primaryTask = items[0] ?? context.todos.taskBundle.primaryTask;
      return { ok: true, output: renderTodoState(context) };
    }

    if (inferredOperation === "update_todo_item") {
      if (!input.id || !input.content) {
        return { ok: false, output: "update_todo_item requires id and content." };
      }
      const item = context.todos.items.find((it) => it.id === input.id);
      if (!item) {
        return { ok: false, output: `Todo item not found: ${input.id}` };
      }
      item.content = input.content;
      return { ok: true, output: renderTodoState(context) };
    }

    if (!input.id) {
      return { ok: false, output: "mark_complete requires id." };
    }

    const item = context.todos.items.find((it) => it.id === input.id);
    if (!item) {
      return { ok: false, output: `Todo item not found: ${input.id}` };
    }
    item.completed = true;

    return { ok: true, output: renderTodoState(context) };
  }
};
