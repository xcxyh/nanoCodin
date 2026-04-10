import type { AgentExecutionSnapshot } from "../../agent/reactLoop.js";
import { formatTaskCompletedText } from "../utils/tokenUsage.js";
import {
  appendActivity,
  createCurrentTurn,
  finalizeTurn,
  setFinalText,
  type ActivityEntry,
  type CompletedTurn,
  type CurrentTurn
} from "./transcript.js";

export interface UiState {
  history: CompletedTurn[];
  currentTurn: CurrentTurn | null;
  busy: boolean;
  cancelRequested: boolean;
  seq: number;
  pendingToolName: string | null;
  latestSnapshot: AgentExecutionSnapshot | null;
}

export type UiAction =
  | { type: "reset" }
  | { type: "task_start"; task: string }
  | { type: "task_cancel_requested" }
  | { type: "task_success"; stepCount: number }
  | { type: "task_failure"; message: string }
  | { type: "task_cancel" }
  | { type: "append_thought"; text: string }
  | { type: "append_action"; name: string; input: unknown }
  | { type: "append_observation"; text: string }
  | { type: "append_final"; text: string }
  | { type: "append_error"; text: string }
  | { type: "set_snapshot"; snapshot: AgentExecutionSnapshot };

function nextId(prefix: string, seq: number): string {
  return `${prefix}-${seq + 1}`;
}

function formatActionEntry(name: string, input: unknown): { text: string; detail?: string } | null {
  const record = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : null;

  if (name === "bash") {
    return {
      text: "Run bash command",
      detail: String(record?.command ?? "(unknown command)")
    };
  }

  if (name === "view") {
    return {
      text: "Read file",
      detail: String(record?.path ?? "(unknown path)")
    };
  }

  if (name === "grep") {
    return {
      text: "Search codebase",
      detail: String(record?.pattern ?? "(pattern)")
    };
  }

  if (name === "todo") {
    return null;
  }

  if (record && Object.keys(record).length === 0) {
    return { text: `Call ${name}` };
  }

  return {
    text: `Call ${name}`,
    detail: JSON.stringify(input)
  };
}

function summarizeBashObservation(text: string): string | null {
  const match = text.match(/^(OK|ERROR):\s*(\{[\s\S]*\})$/);
  if (!match) {
    return null;
  }

  try {
    const payload = JSON.parse(match[2]) as {
      exit_code?: number | null;
      stdout_tail?: string;
      stderr_tail?: string;
      policy_decision?: string;
    };
    const stderr = payload.stderr_tail?.trim();
    const stdout = payload.stdout_tail?.trim();
    const detail = stderr || stdout || "(no stdout/stderr)";
    const firstLine = detail.split("\n")[0] ?? detail;
    const exit = payload.exit_code ?? "null";
    const policy = payload.policy_decision ?? "unknown";
    return `${match[1]} exit=${exit} policy=${policy}: ${firstLine}`;
  } catch {
    return null;
  }
}

function summarizeObservation(text: string, sourceTool?: string | null): string {
  const firstLine = text.split("\n")[0]?.trim() || "(empty output)";
  if (sourceTool === "bash") {
    return summarizeBashObservation(text) ?? firstLine;
  }
  return firstLine;
}

function updateCurrentTurn(state: UiState, fn: (turn: CurrentTurn) => CurrentTurn): UiState {
  if (!state.currentTurn) {
    return state;
  }

  return {
    ...state,
    currentTurn: fn(state.currentTurn)
  };
}

function pushActivity(
  state: UiState,
  kind: ActivityEntry["kind"],
  text: string,
  detail?: string,
  sourceTool?: string
): UiState {
  if (!state.currentTurn) {
    return state;
  }

  const entry: ActivityEntry = {
    id: nextId("activity", state.seq),
    kind,
    text,
    detail,
    sourceTool
  };

  return {
    ...updateCurrentTurn(state, (turn) => appendActivity(turn, entry)),
    seq: state.seq + 1
  };
}

function completeCurrentTurn(state: UiState, result: string, status: CompletedTurn["status"]): UiState {
  if (!state.currentTurn) {
    return {
      ...state,
      busy: false,
      cancelRequested: false,
      pendingToolName: null
    };
  }

  return {
    ...state,
    history: [...state.history, finalizeTurn(state.currentTurn, result, status)],
    currentTurn: null,
    busy: false,
    cancelRequested: false,
    pendingToolName: null
  };
}

export const initialUiState: UiState = {
  history: [],
  currentTurn: null,
  busy: false,
  cancelRequested: false,
  seq: 0,
  pendingToolName: null,
  latestSnapshot: null
};

export function uiReducer(state: UiState, action: UiAction): UiState {
  if (action.type === "reset") {
    return {
      ...initialUiState
    };
  }

  if (action.type === "task_start") {
    return {
      ...state,
      busy: true,
      cancelRequested: false,
      seq: state.seq + 1,
      pendingToolName: null,
      latestSnapshot: null,
      currentTurn: createCurrentTurn(nextId("turn", state.seq), action.task)
    };
  }

  if (action.type === "task_cancel_requested") {
    return pushActivity({
      ...state,
      busy: true,
      cancelRequested: true,
      pendingToolName: null
    }, "loading", "Cancelling...");
  }

  if (action.type === "append_thought") {
    return {
      ...pushActivity({
        ...state,
        pendingToolName: null
      }, "thinking", action.text),
      pendingToolName: null
    };
  }

  if (action.type === "append_action") {
    const actionEntry = formatActionEntry(action.name, action.input);
    if (!actionEntry) {
      return {
        ...state,
        pendingToolName: action.name
      };
    }

    return {
      ...pushActivity({
        ...state,
        pendingToolName: action.name
      }, "tool", actionEntry.text, actionEntry.detail, action.name),
      pendingToolName: action.name
    };
  }

  if (action.type === "append_observation") {
    const sourceTool = state.pendingToolName;
    if (sourceTool === "todo") {
      return {
        ...state,
        pendingToolName: null
      };
    }

    return {
      ...pushActivity({
        ...state,
        pendingToolName: null
      }, "note", summarizeObservation(action.text, sourceTool), undefined, sourceTool ?? undefined),
      pendingToolName: null
    };
  }

  if (action.type === "append_final") {
    return updateCurrentTurn({
      ...state,
      pendingToolName: null
    }, (turn) => setFinalText(turn, action.text));
  }

  if (action.type === "append_error") {
    const withActivity = pushActivity({
      ...state,
      pendingToolName: null
    }, "error", action.text);

    return updateCurrentTurn({
      ...withActivity,
      pendingToolName: null
    }, (turn) => setFinalText(turn, action.text));
  }

  if (action.type === "task_success") {
    const result = state.currentTurn?.finalText ?? formatTaskCompletedText(action.stepCount, state.latestSnapshot?.tokenUsage ?? null);
    return completeCurrentTurn(state, result, "final");
  }

  if (action.type === "task_failure") {
    return completeCurrentTurn(state, `Execution failed: ${action.message}`, "error");
  }

  if (action.type === "task_cancel") {
    return completeCurrentTurn(state, "Cancelled.", "cancelled");
  }

  if (action.type === "set_snapshot") {
    return {
      ...state,
      latestSnapshot: action.snapshot
    };
  }

  return state;
}
