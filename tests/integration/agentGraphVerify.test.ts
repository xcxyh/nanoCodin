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

class UsageCreateThenFinalModel implements ModelProvider {
  private calls = 0;

  async generate() {
    this.calls += 1;
    if (this.calls === 1) {
      return {
        text: [
          "Thought: write the change",
          "Action: create",
          "Action Input: {\"path\":\"tmp.txt\",\"content\":\"hello\"}"
        ].join("\n"),
        usage: {
          promptTokens: 5,
          completionTokens: 2,
          totalTokens: 7,
          source: "actual" as const
        }
      };
    }

    return {
      text: [
        "Thought: done",
        "Action: final",
        "Action Input: {\"answer\":\"all done\"}"
      ].join("\n"),
      usage: {
        promptTokens: 2,
        completionTokens: 1,
        totalTokens: 3,
        source: "estimated" as const
      }
    };
  }
}

class UsageFinalOnlyModel implements ModelProvider {
  async generate() {
    return {
      text: [
        "Thought: done",
        "Action: final",
        "Action Input: {\"answer\":\"all done\"}"
      ].join("\n"),
      usage: {
        promptTokens: 4,
        completionTokens: 3,
        totalTokens: 7,
        source: "actual" as const
      }
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

  it("accumulates token usage across model calls and marks mixed sources", async () => {
    const baseContext = createToolContext();
    const context = createToolContext({
      runtimeConfig: {
        ...baseContext.runtimeConfig,
        agent: {
          ...baseContext.runtimeConfig.agent,
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
    const snapshots: Array<{ totalTokens: number; source: string | null }> = [];
    const graph = new CodingAgentGraph(
      new UsageCreateThenFinalModel(),
      new ToolRegistry([createTool]),
      context,
      4,
      8
    );

    const result = await graph.run({
      messages: [{ role: "user", content: "make this change" }],
      onEvent: (event) => {
        if (event.type === "state") {
          snapshots.push({
            totalTokens: event.snapshot.tokenUsage?.totalTokens ?? 0,
            source: event.snapshot.tokenUsage?.source ?? null
          });
        }
      }
    });

    expect(result.finalAnswer).toContain("all done");
    expect(snapshots.some((snapshot) => snapshot.totalTokens === 7 && snapshot.source === "actual")).toBe(true);
    expect(snapshots.some((snapshot) => snapshot.totalTokens === 10 && snapshot.source === "mixed")).toBe(true);
  });

  it("emits the final token snapshot even when the model answers final immediately", async () => {
    const baseContext = createToolContext();
    const context = createToolContext({
      runtimeConfig: {
        ...baseContext.runtimeConfig,
        agent: {
          ...baseContext.runtimeConfig.agent,
          verifyRequiredKeywords: []
        }
      }
    });
    const snapshots: number[] = [];
    const graph = new CodingAgentGraph(
      new UsageFinalOnlyModel(),
      new ToolRegistry([]),
      context,
      2,
      8
    );

    const result = await graph.run({
      messages: [{ role: "user", content: "answer directly" }],
      onEvent: (event) => {
        if (event.type === "state") {
          snapshots.push(event.snapshot.tokenUsage?.totalTokens ?? 0);
        }
      }
    });

    expect(result.finalAnswer).toContain("all done");
    expect(snapshots.at(-1)).toBe(7);
  });
});
