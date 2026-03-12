import React, { useEffect, useMemo, useReducer, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import type { AgentEvent, } from "../agent/reactLoop.js";
import { CodingAgentGraph } from "../agent/agentGraph.js";
import type { Message } from "../core/messageTypes.js";
import type { PermissionController, PermissionPromptChoice, PermissionRequest } from "../core/permission.js";

interface Props {
  graph: CodingAgentGraph;
  permissionController: PermissionController;
}

type LogKind =
  | "user"
  | "thought"
  | "action"
  | "observation"
  | "final"
  | "error"
  | "meta";

interface LogEntry {
  id: string;
  kind: LogKind;
  text: string;
  summary?: string;
  hiddenLineCount?: number;
  ephemeral?: boolean;
  collapsed?: boolean;
  sourceTool?: string;
}

const BRAND_COLOR = "#38bdf8";
const BANNER_LINES = [
  " _   _                         ____          _ _       ",
  "| \\ | | __ _ _ __   ___      / ___|___   __| (_)_ __  ",
  "|  \\| |/ _` | '_ \\ / _ \\____| |   / _ \\ / _` | | '_ \\ ",
  "| |\\  | (_| | | | | (_) |____| |__| (_) | (_| | | | | |",
  "|_| \\_|\\__,_|_| |_|\\___/      \\____\\___/ \\__,_|_|_| |_|"
];

function formatLogPrefix(kind: LogKind): string {
  if (kind === "user") return "● You";
  if (kind === "thought") return "◦ Thinking";
  if (kind === "action") return "↳ Tool";
  if (kind === "observation") return "⋯ Output";
  if (kind === "final") return "✓ Nano Codin";
  if (kind === "error") return "✕ Error";
  return "•";
}

function formatLogColor(kind: LogKind): string {
  if (kind === "user") return "white";
  if (kind === "thought") return "green";
  if (kind === "action") return "cyan";
  if (kind === "observation") return "gray";
  if (kind === "final") return BRAND_COLOR;
  if (kind === "error") return "red";
  return "gray";
}

interface UiState {
  logs: LogEntry[];
  busy: boolean;
  thinkingVisible: boolean;
  thinkingTick: number;
  seq: number;
  pendingToolName: string | null;
}

interface PermissionPromptState {
  request: PermissionRequest;
  resolve: (choice: PermissionPromptChoice) => void;
}

type UiAction =
  | { type: "task_start"; task: string }
  | { type: "task_success"; stepCount: number }
  | { type: "task_failure"; message: string }
  | { type: "append_action"; name: string; input: unknown }
  | { type: "append_thought"; text: string }
  | { type: "append_observation"; text: string }
  | { type: "append_final"; text: string }
  | { type: "append_error"; text: string }
  | { type: "thinking_tick" }
  | { type: "toggle_latest_observation" };

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

function clearThinkingPlaceholder(logs: LogEntry[]): LogEntry[] {
  return logs.filter((entry) => !(entry.ephemeral && entry.kind === "thought"));
}

function makeThinkingText(tick: number): string {
  return `Thinking${".".repeat((tick % 3) + 1)}`;
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

const initialUiState: UiState = {
  logs: [],
  busy: false,
  thinkingVisible: false,
  thinkingTick: 0,
  seq: 0,
  pendingToolName: null
};

function uiReducer(state: UiState, action: UiAction): UiState {
  if (action.type === "task_start") {
    let next: UiState = {
      ...state,
      busy: true,
      thinkingVisible: false,
      thinkingTick: 0,
      logs: clearThinkingPlaceholder(state.logs),
      pendingToolName: null
    };
    next = appendLog(next, "meta", SEPARATOR);
    next = appendLog(next, "user", action.task);
    return next;
  }

  if (action.type === "task_success") {
    let next: UiState = {
      ...state,
      busy: false,
      thinkingVisible: false,
      thinkingTick: 0,
      logs: clearThinkingPlaceholder(state.logs),
      pendingToolName: null
    };
    next = appendLog(next, "meta", `Completed in ${action.stepCount} step(s).`);
    return next;
  }

  if (action.type === "task_failure") {
    let next: UiState = {
      ...state,
      busy: false,
      thinkingVisible: false,
      thinkingTick: 0,
      logs: clearThinkingPlaceholder(state.logs),
      pendingToolName: null
    };
    next = appendLog(next, "error", `Execution failed: ${action.message}`);
    return next;
  }

  if (action.type === "append_action") {
    let next = appendLog(state, "action", `${action.name} ${JSON.stringify(action.input)}`);
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
      logs: clearThinkingPlaceholder(state.logs),
      thinkingVisible: false,
      thinkingTick: 0,
      pendingToolName: null
    };
    return appendLog(cleared, "thought", action.text);
  }

  if (action.type === "append_observation") {
    const folded = summarizeObservation(action.text);
    const sourceTool = state.pendingToolName;
    const shouldCollapse = sourceTool !== "todo";
    const cleared: UiState = {
      ...state,
      logs: clearThinkingPlaceholder(state.logs),
      thinkingVisible: false,
      thinkingTick: 0,
      pendingToolName: null
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
      logs: clearThinkingPlaceholder(state.logs),
      thinkingVisible: false,
      thinkingTick: 0,
      pendingToolName: null
    };
    return appendLog(cleared, "final", action.text);
  }

  if (action.type === "append_error") {
    const cleared: UiState = {
      ...state,
      logs: clearThinkingPlaceholder(state.logs),
      thinkingVisible: false,
      thinkingTick: 0,
      pendingToolName: null
    };
    return appendLog(cleared, "error", action.text);
  }

  if (action.type === "thinking_tick") {
    if (!state.thinkingVisible) {
      return state;
    }
    return {
      ...state,
      thinkingTick: (state.thinkingTick + 1) % 3
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

function mapAgentEventToUiActions(event: AgentEvent): UiAction[] {
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
  return [{ type: "append_final", text: event.answer }];
}

function renderLogEntry(entry: LogEntry, thinkingTick: number): React.ReactNode {
  if (entry.kind === "meta") {
    return (
      <Text key={entry.id} color="gray">
        {entry.text}
      </Text>
    );
  }

  if (entry.kind === "observation") {
    const lines = entry.text.split("\n");
    const suffix = (entry.hiddenLineCount ?? 0) > 0 ? ` ... (${entry.hiddenLineCount} more lines)` : "";
    if (!entry.collapsed) {
      return (
        <Box key={entry.id} flexDirection="column" marginBottom={0}>
          <Text color={formatLogColor(entry.kind)}>
            {formatLogPrefix(entry.kind)}
            {"  "}
            {lines[0] ?? "(empty output)"}
          </Text>
          {lines.slice(1).map((line, lineIdx) => (
            <Text key={`${entry.id}-expanded-${lineIdx + 1}`} color={formatLogColor(entry.kind)}>
              {"   "}
              {line}
            </Text>
          ))}
        </Box>
      );
    }
    return (
      <Box key={entry.id} flexDirection="column" marginBottom={0}>
        <Text color={formatLogColor(entry.kind)}>
          {formatLogPrefix(entry.kind)}
          {"  "}
          {entry.summary ?? "(empty output)"}
          {suffix}
        </Text>
      </Box>
    );
  }

  const displayedText = entry.ephemeral ? makeThinkingText(thinkingTick) : entry.text;
  const lines = displayedText.split("\n");
  return (
    <Box key={entry.id} flexDirection="column" marginBottom={0}>
      <Text color={formatLogColor(entry.kind)}>
        {formatLogPrefix(entry.kind)}
        {"  "}
        {lines[0]}
      </Text>
      {lines.slice(1).map((line, lineIdx) => (
        <Text key={`${entry.id}-${lineIdx + 1}`} color={formatLogColor(entry.kind)}>
          {"   "}
          {line}
        </Text>
      ))}
    </Box>
  );
}

export function ConsoleApp({ graph, permissionController }: Props) {
  const { exit } = useApp();
  const [input, setInput] = useState("");
  const [uiState, dispatch] = useReducer(uiReducer, initialUiState);
  const [permissionPrompt, setPermissionPrompt] = useState<PermissionPromptState | null>(null);

  const hint = useMemo(() => {
    if (permissionPrompt) {
      return "Permission required. Press Y to allow once, A to allow all, N to deny.";
    }
    if (uiState.busy) {
      return "Nano Codin is reasoning...";
    }
    return "Type a coding task and press Enter. Press E to expand/collapse latest output. Ctrl+C to exit.";
  }, [permissionPrompt, uiState.busy]);

  useEffect(() => {
    if (!uiState.busy && !uiState.thinkingVisible) {
      return undefined;
    }
    const timer = setInterval(() => {
      dispatch({ type: "thinking_tick" });
    }, 300);
    return () => clearInterval(timer);
  }, [uiState.busy, uiState.thinkingVisible]);

  useInput((char, key) => {
    if (permissionPrompt) {
      if (key.ctrl && char === "c") {
        exit();
        return;
      }
      const normalized = char.toLowerCase();
      if (normalized === "y") {
        permissionPrompt.resolve("allow_once");
        setPermissionPrompt(null);
      } else if (normalized === "a") {
        permissionPrompt.resolve("allow_all");
        setPermissionPrompt(null);
      } else if (normalized === "n") {
        permissionPrompt.resolve("deny");
        setPermissionPrompt(null);
      }
      return;
    }

    if (key.ctrl && char === "c") {
      exit();
      return;
    }

    if (uiState.busy) {
      return;
    }

    if (!key.ctrl && !key.meta && (char === "e" || char === "E")) {
      dispatch({ type: "toggle_latest_observation" });
      return;
    }

    if (key.return) {
      const task = input.trim();
      if (task.length === 0) {
        return;
      }

      void runTask(task);
      return;
    }

    if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
      return;
    }

    if (!key.ctrl && !key.meta && char) {
      setInput((prev) => prev + char);
    }
  });

  async function runTask(task: string) {
    dispatch({ type: "task_start", task });
    setInput("");

    const initialMessages: Message[] = [{ role: "user", content: task }];

    try {
      const result = await graph.run({
        messages: initialMessages,
        onEvent: (event: AgentEvent) => {
          const actions = mapAgentEventToUiActions(event);
          for (const uiAction of actions) {
            dispatch(uiAction);
          }
        }
      });

      dispatch({ type: "task_success", stepCount: result.steps.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dispatch({ type: "task_failure", message });
    }
  }

  useEffect(() => {
    const handler = async (request: PermissionRequest) => new Promise<PermissionPromptChoice>((resolve) => {
      setPermissionPrompt({ request, resolve });
    });
    permissionController.setPromptHandler(handler);
    return () => {
      permissionController.setPromptHandler(null);
    };
  }, [permissionController]);

  function renderPermissionPrompt(prompt: PermissionPromptState): React.ReactNode {
    const { toolName, input: toolInput } = prompt.request;
    const inputRecord = toolInput as Record<string, unknown>;
    const detailLabel = toolName === "bash" ? "Command" : "Target";
    const detailValue = toolName === "bash"
      ? String(inputRecord.command ?? "(unknown)")
      : String(inputRecord.path ?? "(unknown)");

    return (
      <Box marginTop={1} borderStyle="round" borderColor="yellow" paddingX={1} flexDirection="column">
        <Text color="yellow">Permission required</Text>
        <Text>Tool: {toolName}</Text>
        <Text>{detailLabel}: {detailValue}</Text>
        <Text>Allow? [y] once, [a] all session, [n] deny</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1} flexDirection="column">
        {BANNER_LINES.map((line, idx) => (
          <Text key={`banner-${idx}`} color={BRAND_COLOR}>
            {line}
          </Text>
        ))}
        <Text color="gray">ReAct Coding Agent</Text>
        <Text color="gray">{hint}</Text>
      </Box>

      <Box flexDirection="column">
        {uiState.logs.slice(-40).map((entry) => renderLogEntry(entry, uiState.thinkingTick))}
      </Box>

      {permissionPrompt ? renderPermissionPrompt(permissionPrompt) : null}

      <Box marginTop={1} borderStyle="round" borderColor={BRAND_COLOR} paddingX={1}>
        <Text color={BRAND_COLOR}>{uiState.busy ? "…" : ">"}</Text>
        <Text> {input}</Text>
      </Box>
    </Box>
  );
}
