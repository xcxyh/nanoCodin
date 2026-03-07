import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Tool, TodoItem } from "../../core/toolTypes.js";

const schema = z.object({
  operation: z.enum(["create_todo_list", "update_todo_item", "mark_complete"]),
  items: z.array(z.string()).optional(),
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

export const todoTool: Tool<Input> = {
  name: "todo",
  description: "Manage in-memory todo list for planning",
  schema,
  execute: async (input, context) => {
    if (input.operation === "create_todo_list") {
      const items = input.items ?? [];
      context.todos.items = items.map((content) => ({
        id: randomUUID().slice(0, 8),
        content,
        completed: false
      }));
      return { ok: true, output: renderTodos(context.todos.items) };
    }

    if (input.operation === "update_todo_item") {
      if (!input.id || !input.content) {
        return { ok: false, output: "update_todo_item requires id and content." };
      }
      const item = context.todos.items.find((it) => it.id === input.id);
      if (!item) {
        return { ok: false, output: `Todo item not found: ${input.id}` };
      }
      item.content = input.content;
      return { ok: true, output: renderTodos(context.todos.items) };
    }

    if (!input.id) {
      return { ok: false, output: "mark_complete requires id." };
    }

    const item = context.todos.items.find((it) => it.id === input.id);
    if (!item) {
      return { ok: false, output: `Todo item not found: ${input.id}` };
    }
    item.completed = true;

    return { ok: true, output: renderTodos(context.todos.items) };
  }
};
