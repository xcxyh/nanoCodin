import { describe, expect, it } from "vitest";
import { initialUiState, uiReducer } from "../../src/ui/state/consoleUiReducer.js";
import { mapAgentEventToUiActions } from "../../src/ui/state/eventMapper.js";

describe("console state", () => {
  it("resets to the initial state", () => {
    const started = uiReducer(initialUiState, { type: "task_start", task: "build it" });
    const reset = uiReducer(started, { type: "reset" });

    expect(reset).toEqual(initialUiState);
  });

  it("stores the latest execution snapshot with structured todos", () => {
    const next = uiReducer(initialUiState, {
      type: "set_snapshot",
      snapshot: {
        phase: "verify",
        todos: [{ id: "todo-1", content: "edit file", status: "in_progress" }],
        todoCounts: {
          pending: 0,
          inProgress: 1,
          completed: 0,
          total: 1
        },
        todoProgressText: "已完成 0/1 (0%)",
        activeTodoId: "todo-1",
        verificationGoal: "Run tests",
        verificationCommands: ["npm run test"],
        verificationStatus: "pending",
        latestVerification: null,
        tokenUsage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
          source: "actual"
        },
        subtaskSummaries: [],
        sessionNextAction: "Run tests",
        touchedFiles: ["src/index.ts"]
      }
    });

    expect(next.latestSnapshot?.phase).toBe("verify");
    expect(next.latestSnapshot?.todos).toEqual([{ id: "todo-1", content: "edit file", status: "in_progress" }]);
    expect(next.latestSnapshot?.todoCounts.inProgress).toBe(1);
    expect(next.latestSnapshot?.tokenUsage?.totalTokens).toBe(15);
  });

  it("starts a new current turn and clears the previous snapshot", () => {
    const state = uiReducer(initialUiState, {
      type: "set_snapshot",
      snapshot: {
        phase: "execute",
        todos: [],
        todoCounts: {
          pending: 0,
          inProgress: 0,
          completed: 0,
          total: 0
        },
        todoProgressText: "已完成 0/0 (0%)",
        activeTodoId: null,
        verificationGoal: "",
        verificationCommands: [],
        verificationStatus: "pending",
        latestVerification: null,
        tokenUsage: {
          promptTokens: 4,
          completionTokens: 2,
          totalTokens: 6,
          source: "actual"
        },
        subtaskSummaries: [],
        sessionNextAction: null,
        touchedFiles: []
      }
    });

    const next = uiReducer(state, { type: "task_start", task: "new task" });

    expect(next.currentTurn?.user).toBe("new task");
    expect(next.latestSnapshot).toBeNull();
  });

  it("records tool activity without exposing thought messages", () => {
    const state = uiReducer(initialUiState, { type: "task_start", task: "inspect files" });
    const next = uiReducer(state, { type: "append_action", name: "view", input: { path: "src/index.ts" } });

    expect(next.currentTurn?.activity).toEqual([
      expect.objectContaining({
        kind: "tool",
        text: "Read file",
        detail: "src/index.ts"
      })
    ]);
  });

  it("stores thought messages in the current activity stream", () => {
    const state = uiReducer(initialUiState, { type: "task_start", task: "inspect files" });
    const next = uiReducer(state, { type: "append_thought", text: "我来帮你看一下当前实现。" });

    expect(next.currentTurn?.activity).toEqual([
      expect.objectContaining({
        kind: "thinking",
        text: "我来帮你看一下当前实现。"
      })
    ]);
  });

  it("does not add todo observations to the visible activity list", () => {
    const state = uiReducer({
      ...initialUiState,
      currentTurn: {
        id: "turn-1",
        user: "do work",
        activity: [],
        finalText: null
      },
      pendingToolName: "todo"
    }, {
      type: "append_observation",
      text: "updated todo"
    });

    expect(state.currentTurn?.activity).toEqual([]);
    expect(state.pendingToolName).toBeNull();
  });

  it("summarizes bash observations into activity lines", () => {
    const withTurn = uiReducer(initialUiState, { type: "task_start", task: "typecheck" });
    const withAction = uiReducer(withTurn, {
      type: "append_action",
      name: "bash",
      input: { command: "npm run typecheck" }
    });
    const next = uiReducer(withAction, {
      type: "append_observation",
      text: [
        "ERROR: {",
        "  \"exit_code\": 2,",
        "  \"stdout_tail\": \"\",",
        "  \"stderr_tail\": \"tsc: found 3 errors\",",
        "  \"duration_ms\": 123,",
        "  \"policy_decision\": \"allow\"",
        "}"
      ].join("\n")
    });

    expect(next.currentTurn?.activity.at(-1)?.text).toContain("tsc: found 3 errors");
  });

  it("compresses a successful turn into history and clears activity", () => {
    const started = uiReducer(initialUiState, { type: "task_start", task: "build it" });
    const withFinal = uiReducer(started, { type: "append_final", text: "Done.\n\nExecution summary:\n..." });
    const next = uiReducer(withFinal, { type: "task_success", stepCount: 3 });

    expect(next.currentTurn).toBeNull();
    expect(next.history).toEqual([
      expect.objectContaining({
        user: "build it",
        result: "Done.\n\nExecution summary:\n...",
        status: "final"
      })
    ]);
  });

  it("keeps the latest snapshot after success, failure, and cancel", () => {
    const snapshot = {
      phase: "finalize" as const,
      todos: [],
      todoCounts: {
        pending: 0,
        inProgress: 0,
        completed: 0,
        total: 0
      },
      todoProgressText: "已完成 0/0 (0%)",
      activeTodoId: null,
      verificationGoal: "",
      verificationCommands: [],
      verificationStatus: "passed",
      latestVerification: "PASS",
      tokenUsage: {
        promptTokens: 12,
        completionTokens: 8,
        totalTokens: 20,
        source: "mixed" as const
      },
      subtaskSummaries: [],
      sessionNextAction: null,
      touchedFiles: []
    };

    const success = uiReducer(
      uiReducer(uiReducer(initialUiState, { type: "task_start", task: "ok" }), { type: "set_snapshot", snapshot }),
      { type: "task_success", stepCount: 1 }
    );
    const failure = uiReducer(
      uiReducer(uiReducer(initialUiState, { type: "task_start", task: "boom" }), { type: "set_snapshot", snapshot }),
      { type: "task_failure", message: "boom" }
    );
    const cancel = uiReducer(
      uiReducer(uiReducer(initialUiState, { type: "task_start", task: "cancel" }), { type: "set_snapshot", snapshot }),
      { type: "task_cancel" }
    );

    expect(success.latestSnapshot?.tokenUsage?.totalTokens).toBe(20);
    expect(failure.latestSnapshot?.tokenUsage?.source).toBe("mixed");
    expect(cancel.latestSnapshot?.phase).toBe("finalize");
  });

  it("maps thought events to no UI actions", () => {
    const actions = mapAgentEventToUiActions({ type: "thought", thought: "hidden" });
    expect(actions).toEqual([{ type: "append_thought", text: "hidden" }]);
  });
});
