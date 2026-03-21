import type { AgentEvent, AgentExecutionSnapshot } from "../agent/reactLoop.js";

export type LogKind =
  | "user"
  | "thought"
  | "loading"
  | "action"
  | "observation"
  | "final"
  | "error"
  | "meta";

export interface LogEntry {
  id: string;
  kind: LogKind;
  text: string;
  summary?: string;
  hiddenLineCount?: number;
  ephemeral?: boolean;
  collapsed?: boolean;
  sourceTool?: string;
}

export interface UiState {
  logs: LogEntry[];
  busy: boolean;
  thinkingVisible: boolean;
  loadingVisible: boolean;
  thinkingTick: number;
  seq: number;
  pendingToolName: string | null;
  latestSnapshot: AgentExecutionSnapshot | null;
}

export type UiAction =
  | { type: "task_start"; task: string }
  | { type: "task_success"; stepCount: number }
  | { type: "task_failure"; message: string }
  | { type: "task_cancel" }
  | { type: "append_action"; name: string; input: unknown }
  | { type: "append_thought"; text: string }
  | { type: "append_observation"; text: string }
  | { type: "append_final"; text: string }
  | { type: "append_error"; text: string }
  | { type: "set_snapshot"; snapshot: AgentExecutionSnapshot }
  | { type: "thinking_tick" }
  | { type: "toggle_latest_observation" };

const LOADING_MESSAGES = [
  "Warming up the agent",
  "Getting tools ready",
  "Reviewing your request",
  "Setting up the workspace",
  "Lining up the next steps",
  "Preparing a careful answer"
];

const SEPARATOR = "────────────────────────────────────────────────────────";

function nextLogId(seq: number): string {
  return `log-${seq + 1}`;
}

function summarizeObservation(text: string): { summary: string; hiddenLineCount: number } {
  const lines = text.split("\n");
  const summary = lines[0]?.trim() || "(empty output)";
  return {
    summary,
    hiddenLineCount: Math.max(0, lines.length - 1)
  };
}

function hasThinkingPlaceholder(logs: LogEntry[]): boolean {
  return logs.some((entry) => entry.ephemeral && entry.kind === "thought");
}

function clearEphemeralPlaceholders(logs: LogEntry[]): LogEntry[] {
  return logs.filter((entry) => !(entry.ephemeral && (entry.kind === "thought" || entry.kind === "loading")));
}

function appendLog(
  state: UiState,
  kind: LogKind,
  text: string,
  options?: { summary?: string; hiddenLineCount?: number; ephemeral?: boolean; collapsed?: boolean; sourceTool?: string }
): UiState {
  const entry: LogEntry = {
    id: nextLogId(state.seq),
    kind,
    text,
    summary: options?.summary,
    hiddenLineCount: options?.hiddenLineCount,
    ephemeral: options?.ephemeral,
    collapsed: options?.collapsed,
    sourceTool: options?.sourceTool
  };

  return {
    ...state,
    seq: state.seq + 1,
    logs: [...state.logs, entry]
  };
}

export const initialUiState: UiState = {
  logs: [],
  busy: false,
  thinkingVisible: false,
  loadingVisible: false,
  thinkingTick: 0,
  seq: 0,
  pendingToolName: null,
  latestSnapshot: null
};

export function hasToggleableObservation(logs: LogEntry[]): boolean {
  for (let i = logs.length - 1; i >= 0; i -= 1) {
    const entry = logs[i];
    if (entry.kind === "observation" && (entry.hiddenLineCount ?? 0) > 0 && entry.sourceTool !== "todo") {
      return true;
    }
  }
  return false;
}

export function uiReducer(state: UiState, action: UiAction): UiState {
  if (action.type === "task_start") {
    const loadingMessage = LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)];
    let next: UiState = {
      ...state,
      busy: true,
      thinkingVisible: false,
      loadingVisible: true,
      thinkingTick: 0,
      logs: clearEphemeralPlaceholders(state.logs),
      pendingToolName: null,
      latestSnapshot: state.latestSnapshot
    };
    next = appendLog(next, "meta", SEPARATOR);
    next = appendLog(next, "user", action.task);
    next = appendLog(next, "loading", loadingMessage, { ephemeral: true });
    return next;
  }

  if (action.type === "task_success") {
    let next: UiState = {
      ...state,
      busy: false,
      thinkingVisible: false,
      loadingVisible: false,
      thinkingTick: 0,
      logs: clearEphemeralPlaceholders(state.logs),
      pendingToolName: null,
      latestSnapshot: state.latestSnapshot
    };
    next = appendLog(next, "meta", `Completed in ${action.stepCount} step(s).`);
    return next;
  }

  if (action.type === "task_failure") {
    let next: UiState = {
      ...state,
      busy: false,
      thinkingVisible: false,
      loadingVisible: false,
      thinkingTick: 0,
      logs: clearEphemeralPlaceholders(state.logs),
      pendingToolName: null,
      latestSnapshot: state.latestSnapshot
    };
    next = appendLog(next, "error", `Execution failed: ${action.message}`);
    return next;
  }

  if (action.type === "task_cancel") {
    let next: UiState = {
      ...state,
      busy: false,
      thinkingVisible: false,
      loadingVisible: false,
      thinkingTick: 0,
      logs: clearEphemeralPlaceholders(state.logs),
      pendingToolName: null,
      latestSnapshot: state.latestSnapshot
    };
    next = appendLog(next, "meta", "Cancelled.");
    return next;
  }

  if (action.type === "append_action") {
    const baseState: UiState = {
      ...state,
      logs: clearEphemeralPlaceholders(state.logs),
      loadingVisible: false
    };
    let next = appendLog(baseState, "action", `${action.name} ${JSON.stringify(action.input)}`);
    if (!hasThinkingPlaceholder(next.logs)) {
      next = appendLog(next, "thought", "Thinking...", { ephemeral: true });
    }
    return {
      ...next,
      thinkingVisible: true,
      pendingToolName: action.name
    };
  }

  if (action.type === "append_thought") {
    const cleared: UiState = {
      ...state,
      logs: clearEphemeralPlaceholders(state.logs),
      thinkingVisible: false,
      loadingVisible: false,
      thinkingTick: 0,
      pendingToolName: null,
      latestSnapshot: state.latestSnapshot
    };
    return appendLog(cleared, "thought", action.text);
  }

  if (action.type === "append_observation") {
    const folded = summarizeObservation(action.text);
    const sourceTool = state.pendingToolName;
    const shouldCollapse = sourceTool !== "todo";
    const cleared: UiState = {
      ...state,
      logs: clearEphemeralPlaceholders(state.logs),
      thinkingVisible: false,
      loadingVisible: false,
      thinkingTick: 0,
      pendingToolName: null,
      latestSnapshot: state.latestSnapshot
    };

    return appendLog(cleared, "observation", action.text, {
      summary: folded.summary,
      hiddenLineCount: folded.hiddenLineCount,
      collapsed: shouldCollapse,
      sourceTool: sourceTool ?? undefined
    });
  }

  if (action.type === "append_final") {
    const cleared: UiState = {
      ...state,
      logs: clearEphemeralPlaceholders(state.logs),
      thinkingVisible: false,
      loadingVisible: false,
      thinkingTick: 0,
      pendingToolName: null,
      latestSnapshot: state.latestSnapshot
    };
    return appendLog(cleared, "final", action.text);
  }

  if (action.type === "append_error") {
    const cleared: UiState = {
      ...state,
      logs: clearEphemeralPlaceholders(state.logs),
      thinkingVisible: false,
      loadingVisible: false,
      thinkingTick: 0,
      pendingToolName: null
    };
    return appendLog(cleared, "error", action.text);
  }

  if (action.type === "thinking_tick") {
    if (!state.thinkingVisible && !state.loadingVisible) {
      return state;
    }
    return {
      ...state,
      thinkingTick: (state.thinkingTick + 1) % 3
    };
  }

  if (action.type === "set_snapshot") {
    return {
      ...state,
      latestSnapshot: action.snapshot
    };
  }

  if (action.type === "toggle_latest_observation") {
    const logs = [...state.logs];
    for (let i = logs.length - 1; i >= 0; i -= 1) {
      const entry = logs[i];
      if (entry.kind === "observation" && (entry.hiddenLineCount ?? 0) > 0 && entry.sourceTool !== "todo") {
        logs[i] = {
          ...entry,
          collapsed: !entry.collapsed
        };
        return {
          ...state,
          logs
        };
      }
    }
    return state;
  }

  return state;
}

export function mapAgentEventToUiActions(event: AgentEvent): UiAction[] {
  if (event.type === "thought") {
    return [{ type: "append_thought", text: event.thought }];
  }
  if (event.type === "action") {
    return [{ type: "append_action", name: event.action.name, input: event.action.input }];
  }
  if (event.type === "observation") {
    return [{ type: "append_observation", text: event.observation }];
  }
  if (event.type === "error") {
    return [{ type: "append_error", text: event.error }];
  }
  if (event.type === "state") {
    return [{ type: "set_snapshot", snapshot: event.snapshot }];
  }
  return [{ type: "append_final", text: event.answer }];
}
