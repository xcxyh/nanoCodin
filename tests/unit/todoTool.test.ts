import { describe, expect, it } from "vitest";
import { todoTool } from "../../src/tools/planning/todo.js";
import { createToolContext } from "../fixtures/runtime.js";

describe("todoTool", () => {
  it("creates todo items as pending by default and renders progress", async () => {
    const context = createToolContext();

    const result = await todoTool.execute({
      operation: "create_todo_list",
      items: ["Refactor UI", "Run tests"]
    }, context);

    expect(result.ok).toBe(true);
    expect(context.todos.items.map((item) => item.status)).toEqual(["pending", "pending"]);
    expect(result.output).toContain("Progress: 0/2 completed (0%)");
    expect(result.output).toContain("In progress: (none)");
    expect(result.output).toContain("[ ]");
  });

  it("sets a single item in progress and clears any previous in-progress item", async () => {
    const context = createToolContext({
      todos: {
        ...createToolContext().todos,
        items: [
          { id: "todo-1", content: "Refactor UI", status: "in_progress" },
          { id: "todo-2", content: "Run tests", status: "pending" }
        ]
      }
    });

    const result = await todoTool.execute({
      operation: "set_in_progress",
      id: "todo-2"
    }, context);

    expect(result.ok).toBe(true);
    expect(context.todos.items).toEqual([
      { id: "todo-1", content: "Refactor UI", status: "pending" },
      { id: "todo-2", content: "Run tests", status: "in_progress" }
    ]);
    expect(result.output).toContain("In progress: Run tests");
    expect(result.output).toContain("[~] todo-2 Run tests");
  });

  it("marks pending and in-progress items as completed", async () => {
    const context = createToolContext({
      todos: {
        ...createToolContext().todos,
        items: [
          { id: "todo-1", content: "Refactor UI", status: "in_progress" },
          { id: "todo-2", content: "Run tests", status: "pending" }
        ]
      }
    });

    const first = await todoTool.execute({
      operation: "mark_complete",
      id: "todo-1"
    }, context);
    const second = await todoTool.execute({
      operation: "mark_complete",
      id: "todo-2"
    }, context);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(context.todos.items.map((item) => item.status)).toEqual(["completed", "completed"]);
    expect(second.output).toContain("Progress: 2/2 completed (100%)");
    expect(second.output).toContain("[x] todo-2 Run tests");
  });
});
