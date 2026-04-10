import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CodingAgentGraph } from "../../src/agent/agentGraph.js";
import { ToolRegistry } from "../../src/tools/registry.js";
import type { ModelGenerateOptions, ModelProvider } from "../../src/llm/modelRouter.js";
import { createToolContext } from "../fixtures/runtime.js";
import { createTool } from "../../src/tools/edit/create.js";
import type { Message } from "../../src/core/messageTypes.js";

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

class AlwaysReadModel implements ModelProvider {
  calls = 0;

  async generate() {
    this.calls += 1;
    return {
      text: [
        "Thought: inspect repeatedly",
        "Action: read",
        "Action Input: {\"note\":\"again\"}"
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

class StructuredCreateThenFinalModel implements ModelProvider {
  private calls = 0;
  sawTools = false;

  constructor(private readonly filePath: string) {}

  async generate(_messages: Message[], options?: ModelGenerateOptions) {
    this.calls += 1;
    this.sawTools = this.sawTools || Boolean(options?.tools);
    if (this.calls === 1) {
      return {
        text: "Use a structured create tool call.",
        toolCall: {
          name: "create",
          input: { path: this.filePath, content: "hello" }
        },
        usage: {
          promptTokens: 3,
          completionTokens: 2,
          totalTokens: 5,
          source: "actual" as const
        }
      };
    }

    return {
      text: "Use a structured final answer.",
      toolCall: {
        name: "final",
        input: { answer: "all done" }
      },
      usage: {
        promptTokens: 2,
        completionTokens: 2,
        totalTokens: 4,
        source: "actual" as const
      }
    };
  }
}

class FourStepCaptureModel implements ModelProvider {
  calls = 0;
  prompts: string[] = [];

  async generate(messages: Message[]) {
    this.calls += 1;
    this.prompts.push(messages[1]?.content ?? "");

    if (this.calls <= 3) {
      return {
        text: [
          `Thought: perform step ${this.calls}`,
          "Action: mutate",
          `Action Input: {\"note\":\"step-${this.calls}\"}`
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

class AbortableModel implements ModelProvider {
  async generate(_messages: Message[], options?: ModelGenerateOptions) {
    return new Promise<never>((_, reject) => {
      const signal = options?.abortSignal;
      if (!signal) {
        reject(new Error("Missing abort signal"));
        return;
      }
      if (signal.aborted) {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
        return;
      }
      signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    });
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

  it("counts agent and tool transitions for the local recursion guard", async () => {
    const model = new AlwaysReadModel();
    const readTool = {
      name: "read",
      description: "Return a stable read-only observation",
      schema: z.object({ note: z.string() }),
      capabilities: ["read_only"] as const,
      async execute(input: { note: string }) {
        return {
          ok: true,
          output: input.note
        };
      }
    };
    const graph = new CodingAgentGraph(
      model,
      new ToolRegistry([readTool]),
      createToolContext(),
      2,
      4
    );

    const result = await graph.run({
      messages: [{ role: "user", content: "inspect until the recursion guard stops" }]
    });

    expect(result.finalAnswer).toContain("Stopped after recursionLimit=4 agent/tool transitions without reaching final.");
    expect(result.finalAnswer).not.toContain("Stopped after maxSteps=2 without reaching final.");
    expect(model.calls).toBe(2);
    expect(result.steps).toHaveLength(2);
    expect(result.steps.every((step) => step.action?.name === "read")).toBe(true);
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

  it("allows mutating actions with a todo plan containing up to ten items", async () => {
    const context = createToolContext({
      runtimeConfig: {
        ...createToolContext().runtimeConfig,
        agent: {
          ...createToolContext().runtimeConfig.agent,
          verifyRequiredKeywords: []
        }
      },
      todos: {
        items: Array.from({ length: 10 }, (_, index) => ({
          id: String(index + 1),
          content: `task-${index + 1}`,
          completed: false
        })),
        verification: {
          goal: "",
          commands: [],
          latestCommand: null,
          latestSummary: null,
          status: "pending"
        },
        taskBundle: { primaryTask: "task-1", subtasks: [], results: [] }
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
  });

  it("clears completed todos before starting a second fresh non-resumed run", async () => {
    const context = createToolContext();
    const graph = new CodingAgentGraph(
      new AlwaysFinalModel(),
      new ToolRegistry([]),
      context,
      2,
      4
    );

    const result = await graph.run({
      messages: [{ role: "user", content: "first task" }],
      checkpointRestore: "disabled"
    });

    context.todos = {
      items: [{ id: "done-1", content: "finished task", completed: true }],
      verification: {
        goal: "Run tests",
        commands: ["npm run test"],
        latestCommand: "npm run test",
        latestSummary: "PASS",
        status: "passed"
      },
      taskBundle: { primaryTask: "finished task", subtasks: [], results: [] }
    };
    context.sessionMemory = {
      goal: "old task",
      decisions: [],
      touchedFiles: [],
      pendingVerification: [],
      failureNotes: [],
      nextAction: "nothing"
    };
    context.commandLogs = [{
      command: "npm run test",
      policyDecision: "allow",
      exitCode: 0,
      durationMs: 1,
      stdoutTail: "ok",
      stderrTail: "",
      ok: true
    }];

    const secondResult = await graph.run({
      messages: [{ role: "user", content: "start a new task" }],
      checkpointRestore: "disabled"
    });

    expect(result.finalAnswer).toContain("all done");
    expect(secondResult.finalAnswer).toContain("all done");
    expect(context.todos.items).toEqual([]);
    expect(context.sessionMemory).toBeNull();
    expect(context.commandLogs).toEqual([]);
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

  it("executes structured tool calls while preserving the registry execution path", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "nanocodin-structured-tools-"));
    const model = new StructuredCreateThenFinalModel("tmp.txt");
    const baseContext = createToolContext();
    const context = createToolContext({
      cwd,
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
    const graph = new CodingAgentGraph(
      model,
      new ToolRegistry([createTool]),
      context,
      4,
      8
    );

    const result = await graph.run({
      messages: [{ role: "user", content: "make this change" }]
    });

    expect(model.sawTools).toBe(true);
    expect(result.finalAnswer).toContain("all done");
    expect(result.steps[0]?.action).toEqual({
      name: "create",
      input: { path: "tmp.txt", content: "hello" }
    });
    expect(result.steps[0]?.observation).toContain("Created file: tmp.txt");
  });

  it("retains full step history through the fourth model call when compression has not started", async () => {
    const model = new FourStepCaptureModel();
    const baseContext = createToolContext();
    const context = createToolContext({
      runtimeConfig: {
        ...baseContext.runtimeConfig,
        agent: {
          ...baseContext.runtimeConfig.agent,
          verifyRequiredKeywords: [],
          compression: {
            ...baseContext.runtimeConfig.agent.compression,
            contextTokenBudget: 10_000,
            tokenThresholdRatio: 0.95
          }
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
    const mutateTool = {
      name: "mutate",
      description: "Return a long observation for regression testing",
      schema: z.object({ note: z.string() }),
      capabilities: ["mutating"] as const,
      async execute(input: { note: string }) {
        return {
          ok: true,
          output: `${input.note}\n${"line\n".repeat(90)}`
        };
      }
    };
    const graph = new CodingAgentGraph(
      model,
      new ToolRegistry([mutateTool]),
      context,
      8,
      12
    );

    const result = await graph.run({
      messages: [{ role: "user", content: "make this change" }]
    });

    expect(result.finalAnswer).toContain("all done");
    expect(model.prompts).toHaveLength(4);
    expect(model.prompts[2]).toContain("Step 1");
    expect(model.prompts[3]).toContain("TOOL: OK: step-1");
    expect(model.prompts[3]).toContain("Action: mutate {&quot;note&quot;:&quot;step-1&quot;}");
    expect(model.prompts[3]).toContain("Observation: OK: step-1");
    expect(model.prompts[3]).toContain("Session memory summary:");
    expect(model.prompts[3]).toContain("&quot;goal&quot;: &quot;Complete the current coding task.&quot;");
    expect(model.prompts[3]).toContain("&quot;decisions&quot;: []");
  });

  it("rejects with AbortError when the run is aborted", async () => {
    const controller = new AbortController();
    const graph = new CodingAgentGraph(
      new AbortableModel(),
      new ToolRegistry([]),
      createToolContext(),
      2,
      8
    );

    queueMicrotask(() => controller.abort());

    await expect(graph.run({
      messages: [{ role: "user", content: "cancel this run" }],
      abortSignal: controller.signal
    })).rejects.toMatchObject({ name: "AbortError" });
  });
});
