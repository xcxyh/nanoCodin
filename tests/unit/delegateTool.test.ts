import { describe, expect, it } from "vitest";
import { delegateTool } from "../../src/tools/planning/delegate.js";
import { createToolContext } from "../fixtures/runtime.js";

describe("delegateTool", () => {
  it("stores structured subtask results in todo state", async () => {
    const context = createToolContext({
      runSubtask: async ({ task }) => ({
        id: "sub-1",
        task,
        summary: "Found the relevant file",
        evidence: ["src/index.ts"],
        touchedFiles: ["src/index.ts"],
        nextActionSuggestion: "Open the file"
      })
    });

    const result = await delegateTool.execute({ task: "Find the entrypoint" }, context);

    expect(result.ok).toBe(true);
    expect(result.output).toContain("summary=Found the relevant file");
    expect(context.todos.taskBundle.results).toHaveLength(1);
    expect(context.todos.taskBundle.results[0]?.task).toBe("Find the entrypoint");
  });
});
