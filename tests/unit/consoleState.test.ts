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
        subtaskSummaries: [],
        sessionNextAction: "Run tests",
        touchedFiles: ["src/index.ts"]
      }
    });

    expect(next.latestSnapshot?.phase).toBe("verify");
    expect(next.latestSnapshot?.verificationCommands).toEqual(["npm run test"]);
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
});
