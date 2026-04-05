import { describe, expect, it } from "vitest";
import { hasToggleableObservation, uiReducer, initialUiState } from "../../src/ui/consoleState.js";

describe("console state helpers", () => {
  it("detects latest toggleable observation", () => {
    const state = uiReducer(initialUiState, { type: "append_action", name: "bash", input: { command: "ls" } });
    const withObservation = uiReducer(state, { type: "append_observation", text: "line1\nline2" });

    expect(hasToggleableObservation(withObservation.logs)).toBe(true);
  });

  it("does not treat todo observation as toggleable", () => {
    const state = {
      ...initialUiState,
      pendingToolName: "todo"
    };

    const withObservation = uiReducer(state, { type: "append_observation", text: "line1\nline2" });

    expect(hasToggleableObservation(withObservation.logs)).toBe(false);
  });

  it("stores latest execution snapshot", () => {
    const next = uiReducer(initialUiState, {
      type: "set_snapshot",
      snapshot: {
        phase: "verify",
        todos: ["[ ] edit file"],
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
    expect(next.latestSnapshot?.verificationCommands).toEqual(["npm run test"]);
    expect(next.latestSnapshot?.tokenUsage?.totalTokens).toBe(15);
  });

  it("renders empty action input without trailing empty object", () => {
    const next = uiReducer(initialUiState, { type: "append_action", name: "view", input: {} });

    expect(next.logs.at(-2)?.text).toBe("view");
  });

  it("summarizes bash json observation with stderr detail", () => {
    const state = uiReducer(initialUiState, {
      type: "append_action",
      name: "bash",
      input: { command: "npm run typecheck" }
    });
    const next = uiReducer(state, {
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

    expect(next.logs.at(-1)?.summary).toContain("detail=tsc: found 3 errors");
  });

  it("clears the previous snapshot when a new task starts", () => {
    const state = uiReducer(initialUiState, {
      type: "set_snapshot",
      snapshot: {
        phase: "execute",
        todos: [],
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

    expect(next.latestSnapshot).toBeNull();
  });

  it("keeps the latest snapshot after task success", () => {
    const state = uiReducer(initialUiState, {
      type: "set_snapshot",
      snapshot: {
        phase: "finalize",
        todos: [],
        verificationGoal: "",
        verificationCommands: [],
        verificationStatus: "passed",
        latestVerification: "PASS",
        tokenUsage: {
          promptTokens: 12,
          completionTokens: 8,
          totalTokens: 20,
          source: "mixed"
        },
        subtaskSummaries: [],
        sessionNextAction: null,
        touchedFiles: []
      }
    });

    const next = uiReducer(state, { type: "task_success", stepCount: 3 });

    expect(next.latestSnapshot?.tokenUsage?.totalTokens).toBe(20);
    expect(next.latestSnapshot?.tokenUsage?.source).toBe("mixed");
    expect(next.logs.at(-1)?.text).toBe("Completed in 3 step(s). 0.02k tokens.");
  });

  it("keeps the latest snapshot after task failure", () => {
    const state = uiReducer(initialUiState, {
      type: "set_snapshot",
      snapshot: {
        phase: "finalize",
        todos: [],
        verificationGoal: "",
        verificationCommands: [],
        verificationStatus: "failed",
        latestVerification: "FAIL",
        tokenUsage: {
          promptTokens: 7,
          completionTokens: 3,
          totalTokens: 10,
          source: "estimated"
        },
        subtaskSummaries: [],
        sessionNextAction: null,
        touchedFiles: []
      }
    });

    const next = uiReducer(state, { type: "task_failure", message: "boom" });

    expect(next.latestSnapshot?.tokenUsage?.totalTokens).toBe(10);
    expect(next.latestSnapshot?.tokenUsage?.source).toBe("estimated");
  });

  it("keeps the latest snapshot after task cancel", () => {
    const state = uiReducer(initialUiState, {
      type: "set_snapshot",
      snapshot: {
        phase: "execute",
        todos: [],
        verificationGoal: "",
        verificationCommands: [],
        verificationStatus: "pending",
        latestVerification: null,
        tokenUsage: {
          promptTokens: 9,
          completionTokens: 1,
          totalTokens: 10,
          source: "actual"
        },
        subtaskSummaries: [],
        sessionNextAction: null,
        touchedFiles: []
      }
    });

    const next = uiReducer(state, { type: "task_cancel" });

    expect(next.latestSnapshot?.tokenUsage?.totalTokens).toBe(10);
    expect(next.latestSnapshot?.phase).toBe("execute");
  });
});
