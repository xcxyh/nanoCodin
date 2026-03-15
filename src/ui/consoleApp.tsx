import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";
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
  | "loading"
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
  if (kind === "loading") return "◦ Loading";
  if (kind === "action") return "↳ Tool";
  if (kind === "observation") return "⋯ Output";
  if (kind === "final") return "✓ Nano Codin";
  if (kind === "error") return "✕ Error";
  return "•";
}

function formatLogColor(kind: LogKind): string {
  if (kind === "user") return "white";
  if (kind === "thought") return "green";
  if (kind === "loading") return "green";
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
  loadingVisible: boolean;
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
  | { type: "task_cancel" }
  | { type: "append_action"; name: string; input: unknown }
  | { type: "append_thought"; text: string }
  | { type: "append_observation"; text: string }
  | { type: "append_final"; text: string }
  | { type: "append_error"; text: string }
  | { type: "thinking_tick" }
  | { type: "toggle_latest_observation" };

const SEPARATOR = "────────────────────────────────────────────────────────";
const LOADING_MESSAGES = [
  "Warming up the agent",
  "Getting tools ready",
  "Reviewing your request",
  "Setting up the workspace",
  "Lining up the next steps",
  "Preparing a careful answer"
];
const EXIT_ARM_WINDOW_MS = 1500;

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

function makeThinkingText(tick: number): string {
  return `Thinking${".".repeat((tick % 3) + 1)}`;
}

function makeLoadingText(message: string, tick: number): string {
  return `${message}${".".repeat((tick % 3) + 1)}`;
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
  loadingVisible: false,
  thinkingTick: 0,
  seq: 0,
  pendingToolName: null
};

function uiReducer(state: UiState, action: UiAction): UiState {
  if (action.type === "task_start") {
    const loadingMessage = LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)];
    let next: UiState = {
      ...state,
      busy: true,
      thinkingVisible: false,
      loadingVisible: true,
      thinkingTick: 0,
      logs: clearEphemeralPlaceholders(state.logs),
      pendingToolName: null
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
      loadingVisible: false,
      thinkingTick: 0,
      logs: clearEphemeralPlaceholders(state.logs),
      pendingToolName: null
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
      pendingToolName: null
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
      logs: clearEphemeralPlaceholders(state.logs),
      thinkingVisible: false,
      loadingVisible: false,
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
      logs: clearEphemeralPlaceholders(state.logs),
      thinkingVisible: false,
      loadingVisible: false,
      thinkingTick: 0,
      pendingToolName: null
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
  if (entry.kind === "loading") {
    const loadingText = entry.ephemeral ? makeLoadingText(entry.text, thinkingTick) : entry.text;
    const lines = loadingText.split("\n");
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
  const [input, setInputState] = useState("");
  const inputRef = useRef("");
  const setInput = (next: string) => {
    inputRef.current = next;
    setInputState(next);
  };
  const [cursor, setCursorState] = useState(0);
  const cursorRef = useRef(0);
  const setCursor = (next: number) => {
    cursorRef.current = next;
    setCursorState(next);
  };
  const [uiState, dispatch] = useReducer(uiReducer, initialUiState);
  const [permissionPrompt, setPermissionPrompt] = useState<PermissionPromptState | null>(null);
  const [exitArmedAt, setExitArmedAt] = useState<number | null>(null);
  const exitArmedAtRef = useRef<number | null>(null);
  const activeRunIdRef = useRef(0);

  const clearExitArm = () => {
    if (exitArmedAtRef.current !== null) {
      exitArmedAtRef.current = null;
      setExitArmedAt(null);
    }
  };

  const armExit = () => {
    const now = Date.now();
    exitArmedAtRef.current = now;
    setExitArmedAt(now);
  };

  const tryExit = () => {
    const armedAt = exitArmedAtRef.current;
    const now = Date.now();
    if (armedAt && now - armedAt <= EXIT_ARM_WINDOW_MS) {
      exit();
      return true;
    }
    armExit();
    return false;
  };

  const clampCursor = (next: number, value = inputRef.current) => Math.max(0, Math.min(next, value.length));

  const hint = useMemo(() => {
    if (permissionPrompt) {
      return "Permission required. Press Y to allow once, A to allow all, N to deny.";
    }
    if (uiState.busy) {
      return "Nano Codin is working. Press ESC to cancel.";
    }
    if (exitArmedAt) {
      return "Press Ctrl+C again to exit.";
    }
    return "Type a coding task and press Enter. Press Ctrl+E to expand/collapse latest output. Ctrl+C twice to exit.";
  }, [permissionPrompt, uiState.busy, exitArmedAt]);

  useEffect(() => {
    if (!uiState.busy && !uiState.thinkingVisible && !uiState.loadingVisible) {
      return undefined;
    }
    const timer = setInterval(() => {
      dispatch({ type: "thinking_tick" });
    }, 300);
    return () => clearInterval(timer);
  }, [uiState.busy, uiState.thinkingVisible, uiState.loadingVisible]);

  useEffect(() => {
    if (exitArmedAt === null) {
      return undefined;
    }
    const timeout = setTimeout(() => {
      if (exitArmedAtRef.current === exitArmedAt) {
        clearExitArm();
      }
    }, EXIT_ARM_WINDOW_MS);
    return () => clearTimeout(timeout);
  }, [exitArmedAt]);

  useInput((char, key) => {
    if (key.escape) {
      if (uiState.busy) {
        activeRunIdRef.current += 1;
        dispatch({ type: "task_cancel" });
      }
      return;
    }

    if (key.ctrl && char === "c") {
      tryExit();
      return;
    }

    if (permissionPrompt) {
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

    if (uiState.busy) {
      return;
    }

    clearExitArm();

    if (key.ctrl && !key.meta && (char === "e" || char === "E")) {
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

    if (key.leftArrow) {
      setCursor(clampCursor(cursorRef.current - 1));
      return;
    }

    if (key.rightArrow) {
      setCursor(clampCursor(cursorRef.current + 1));
      return;
    }

    if (key.backspace || (key.delete && !key.ctrl)) {
      const currentInput = inputRef.current;
      const cursorPos = cursorRef.current;
      if (cursorPos === 0) {
        return;
      }
      const next = currentInput.slice(0, cursorPos - 1) + currentInput.slice(cursorPos);
      setInput(next);
      setCursor(clampCursor(cursorPos - 1, next));
      return;
    }

    if (key.delete) {
      const currentInput = inputRef.current;
      const cursorPos = cursorRef.current;
      if (cursorPos >= currentInput.length) {
        return;
      }
      const next = currentInput.slice(0, cursorPos) + currentInput.slice(cursorPos + 1);
      setInput(next);
      setCursor(clampCursor(cursorPos, next));
      return;
    }

    if (!key.ctrl && !key.meta && char) {
      const currentInput = inputRef.current;
      const cursorPos = cursorRef.current;
      const next = currentInput.slice(0, cursorPos) + char + currentInput.slice(cursorPos);
      setInput(next);
      setCursor(clampCursor(cursorPos + char.length, next));
    }
  });

  async function runTask(task: string) {
    const runId = activeRunIdRef.current + 1;
    activeRunIdRef.current = runId;
    dispatch({ type: "task_start", task });
    setInput("");
    setCursor(0);

    const initialMessages: Message[] = [{ role: "user", content: task }];

    try {
      const result = await graph.run({
        messages: initialMessages,
        onEvent: (event: AgentEvent) => {
          if (runId !== activeRunIdRef.current) {
            return;
          }
          const actions = mapAgentEventToUiActions(event);
          for (const uiAction of actions) {
            dispatch(uiAction);
          }
        }
      });

      if (runId !== activeRunIdRef.current) {
        return;
      }

      dispatch({ type: "task_success", stepCount: result.steps.length });
    } catch (error) {
      if (runId !== activeRunIdRef.current) {
        return;
      }
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
        <Text> {input.slice(0, cursor)}</Text>
        <Text color={BRAND_COLOR}>｜</Text>
        <Text>{input.slice(cursor)}</Text>
      </Box>
    </Box>
  );
}
