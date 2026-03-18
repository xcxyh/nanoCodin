import { describe, expect, it } from "vitest";
import { CodingAgentGraph } from "../../src/agent/agentGraph.js";
import { ToolRegistry } from "../../src/tools/registry.js";
import type { ModelProvider } from "../../src/llm/modelRouter.js";
import { createToolContext } from "../fixtures/runtime.js";

class AlwaysFinalModel implements ModelProvider {
  async generate() {
    return {
      text: [
        "Thought: done",
        "Action: final",
        "Action Input: {\"answer\":\"all done\"}"
      ].join("\n")
    };
  }
}

class AlwaysCreateModel implements ModelProvider {
  async generate() {
    return {
      text: [
        "Thought: write the change",
        "Action: create",
        "Action Input: {\"path\":\"tmp.txt\",\"content\":\"hello\"}"
      ].join("\n")
    };
  }
}

describe("CodingAgentGraph verification guard", () => {
  it("blocks final answer until verification action succeeds", async () => {
    const context = createToolContext();
    const graph = new CodingAgentGraph(
      new AlwaysFinalModel(),
      new ToolRegistry([]),
      context,
      2,
      8
    );

    const result = await graph.run({
      messages: [{ role: "user", content: "please fix this bug" }]
    });

    expect(result.finalAnswer).toContain("Stopped after maxSteps=2 without reaching final.");
    expect(result.steps.some((step) => (step.observation ?? "").includes("Verification required before final answer"))).toBe(true);
  });

  it("blocks mutating actions when todo plan has no verification plan", async () => {
    const context = createToolContext({
      todos: {
        items: [{ id: "1", content: "edit file", completed: false }],
        verificationPlan: [],
        taskBundle: { primaryTask: "edit file", subtasks: [], results: [] }
      }
    });
    const graph = new CodingAgentGraph(
      new AlwaysCreateModel(),
      new ToolRegistry([]),
      context,
      2,
      8
    );

    const result = await graph.run({
      messages: [{ role: "user", content: "implement this change" }]
    });

    expect(result.finalAnswer).toContain("Stopped after maxSteps=2 without reaching final.");
    expect(result.steps.some((step) => (step.observation ?? "").includes("Plan gate requires todo.create_todo_list"))).toBe(true);
  });
});
