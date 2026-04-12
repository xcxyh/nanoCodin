import { describe, expect, it } from "vitest";
import type { Message } from "../../src/core/messageTypes.js";
import { applyToolResult, createWorkingMemory } from "../../src/services/memoryManager.js";
import { createEmptyTodoState } from "../../src/core/toolTypes.js";

describe("memoryManager", () => {
  it("uses the latest user message as the goal instead of the last tool output", () => {
    const messages: Message[] = [
      { role: "user", content: "Fix the failing tests." },
      { role: "tool", content: "OK: extremely long tool output\nline\nline\nline" }
    ];

    const result = createWorkingMemory(messages);

    expect(result.goal).toBe("Fix the failing tests.");
  });

  it("updates working memory from tool results without polluting durable memory concerns", () => {
    const todos = createEmptyTodoState();
    todos.items = [
      { id: "1", content: "Patch the bug", status: "in_progress" }
    ];
    todos.verification.goal = "Run checks";
    todos.verification.commands = ["npm run test"];
    const result = applyToolResult(
      { name: "bash", input: { command: "npm run test" } },
      "ERROR: test failed on line 10\nstack line 1\nstack line 2",
      null,
      todos,
      [{ role: "user", content: "Fix the bug." }]
    );

    expect(result.recentFailures).toEqual(["ERROR: test failed on line 10"]);
    expect(result.verification.some((item) => item.includes("npm run test"))).toBe(true);
    expect(result.nextAction).toBe("Patch the bug");
  });
});
