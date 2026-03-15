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
});
