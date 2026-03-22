import { describe, expect, it } from "vitest";
import { CodingAgentGraph } from "../../src/agent/agentGraph.js";
import { ToolRegistry } from "../../src/tools/registry.js";
import type { ModelProvider } from "../../src/llm/modelRouter.js";
import { createToolContext } from "../fixtures/runtime.js";
import { createTool } from "../../src/tools/edit/create.js";

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

class CreateThenFinalModel implements ModelProvider {
  private calls = 0;

  async generate() {
    this.calls += 1;
    if (this.calls === 1) {
      return {
        text: [
          "Thought: write the change",
          "Action: create",
          "Action Input: {\"path\":\"tmp.txt\",\"content\":\"hello\"}"
        ].join("\n")
      };
    }

    return {
      text: [
        "Thought: done",
        "Action: final",
        "Action Input: {\"answer\":\"all done\"}"
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

  it("allows mutating actions with a todo plan even before verification commands are filled in", async () => {
    const context = createToolContext({
      runtimeConfig: {
        ...createToolContext().runtimeConfig,
        agent: {
          ...createToolContext().runtimeConfig.agent,
          verifyRequiredKeywords: []
        }
      },
      todos: {
        items: [{ id: "1", content: "edit file", completed: false }],
        verification: {
          goal: "",
          commands: [],
          latestCommand: null,
          latestSummary: null,
          status: "pending"
        },
        taskBundle: { primaryTask: "edit file", subtasks: [], results: [] }
      }
    });
    const graph = new CodingAgentGraph(
      new CreateThenFinalModel(),
      new ToolRegistry([createTool]),
      context,
      4,
      8
    );

    const result = await graph.run({
      messages: [{ role: "user", content: "make this change" }]
    });

    expect(result.finalAnswer).toContain("all done");
    expect(result.steps.some((step) => (step.observation ?? "").includes("Plan gate requires both a verification goal"))).toBe(false);
    expect(context.todos.verification.status).toBe("pending");
    expect(context.todos.items.some((item) => item.completed)).toBe(false);
  });
});
