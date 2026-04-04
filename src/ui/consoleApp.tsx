import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Box, useApp, useInput } from "ink";
import path from "node:path";
import { CodingAgentGraph } from "../agent/agentGraph.js";
import type { Message } from "../core/messageTypes.js";
import type { PermissionController, PermissionPromptChoice, PermissionRequest } from "../core/permission.js";
import { collectFiles } from "../tools/fs/grep.js";
import {
  ConsoleHeader,
  ConsoleInputBar,
  ConsoleLogList,
  PermissionPromptBox
} from "./consoleComponents.js";
import { clampFilePickerIndex, getFilePickerQuery } from "./filePicker.js";
import {
  hasToggleableObservation,
  initialUiState,
  mapAgentEventToUiActions,
  uiReducer
} from "./consoleState.js";
import { isCtrlC, isCtrlE, useConsoleInput } from "./useConsoleInput.js";

interface Props {
  graph: CodingAgentGraph;
  permissionController: PermissionController;
}

interface PermissionPromptState {
  request: PermissionRequest;
  resolve: (choice: PermissionPromptChoice) => void;
}

interface FilePickerState {
  query: string;
  selectedIndex: number;
  atPosition: number;
}

const EXIT_ARM_WINDOW_MS = 1500;

function resolvePermissionChoice(char: string): PermissionPromptChoice | null {
  const normalized = char.toLowerCase();
  if (normalized === "y") return "allow_once";
  if (normalized === "a") return "allow_all";
  if (normalized === "n") return "deny";
  return null;
}

export function ConsoleApp({ graph, permissionController }: Props) {
  const { exit } = useApp();
  const { input, cursor, inputRef, cursorRef, setInput, setCursor, reset, applyKey } = useConsoleInput();

  const [uiState, dispatch] = useReducer(uiReducer, initialUiState);
  const [permissionPrompt, setPermissionPrompt] = useState<PermissionPromptState | null>(null);
  const [exitArmedAt, setExitArmedAt] = useState<number | null>(null);
  const [filePicker, setFilePicker] = useState<FilePickerState | null>(null);

  const exitArmedAtRef = useRef<number | null>(null);
  const activeRunIdRef = useRef(0);
  const fileListRef = useRef<string[]>([]);
  const fileListLoadedRef = useRef(false);
  const fileListLoadingRef = useRef<Promise<void> | null>(null);
  const [fileListVersion, setFileListVersion] = useState(0);

  const filteredFiles = useMemo(() => {
    if (!filePicker) return [];
    const q = filePicker.query.toLowerCase();
    return fileListRef.current
      .filter(f => q === "" || f.toLowerCase().includes(q))
      .slice(0, 10);
  }, [filePicker, fileListVersion]);

  async function loadFileList() {
    if (fileListLoadedRef.current) return;
    if (fileListLoadingRef.current) {
      await fileListLoadingRef.current;
      return;
    }

    fileListLoadingRef.current = (async () => {
      const cwd = process.cwd();
      const absolutePaths = await collectFiles(cwd);
      fileListRef.current = absolutePaths.map(f => path.relative(cwd, f)).sort();
      fileListLoadedRef.current = true;
      setFileListVersion(version => version + 1);
    })();

    try {
      await fileListLoadingRef.current;
    } finally {
      fileListLoadingRef.current = null;
    }
  }

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

  const hint = useMemo(() => {
    if (permissionPrompt) {
      return "Permission required. Press Y to allow once, A to allow all, N to deny.";
    }
    if (filePicker) {
      return "Type to filter. Up/Down to navigate, Enter to select, Esc to cancel.";
    }
    if (uiState.busy) {
      return "Nano Codin is working. Press ESC to cancel.";
    }
    if (exitArmedAt) {
      return "Press Ctrl+C again to exit.";
    }
    return "Type a coding task and press Enter. Press Ctrl+E to expand/collapse latest output. Ctrl+C twice to exit.";
  }, [permissionPrompt, filePicker, uiState.busy, exitArmedAt]);

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

  async function runTask(task: string) {
    const runId = activeRunIdRef.current + 1;
    activeRunIdRef.current = runId;

    dispatch({ type: "task_start", task });
    reset();

    const initialMessages: Message[] = [{ role: "user", content: task }];

    try {
      const result = await graph.run({
        messages: initialMessages,
        onEvent: (event) => {
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

  useInput((char, key) => {
    if (key.escape) {
      if (filePicker) {
        setFilePicker(null);
        return;
      }
      if (uiState.busy) {
        activeRunIdRef.current += 1;
        dispatch({ type: "task_cancel" });
      }
      return;
    }

    if (isCtrlC(char, key)) {
      if (filePicker) {
        setFilePicker(null);
        return;
      }
      tryExit();
      return;
    }

    if (permissionPrompt) {
      const choice = resolvePermissionChoice(char);
      if (choice) {
        permissionPrompt.resolve(choice);
        setPermissionPrompt(null);
      }
      return;
    }

    if (uiState.busy) {
      return;
    }

    clearExitArm();

    if (filePicker) {
      if (key.upArrow) {
        setFilePicker(prev => prev && ({
          ...prev,
          selectedIndex: clampFilePickerIndex(prev.selectedIndex - 1, filteredFiles.length)
        }));
        return;
      }
      if (key.downArrow) {
        setFilePicker(prev => prev && ({
          ...prev,
          selectedIndex: clampFilePickerIndex(prev.selectedIndex + 1, filteredFiles.length)
        }));
        return;
      }
      if (key.return) {
        if (filteredFiles.length > 0) {
          const selectedIndex = clampFilePickerIndex(filePicker.selectedIndex, filteredFiles.length);
          const selected = filteredFiles[selectedIndex] ?? filteredFiles[0];
          const atPos = filePicker.atPosition;
          const beforeAt = inputRef.current.slice(0, atPos);
          const afterQuery = inputRef.current.slice(atPos + 1 + filePicker.query.length);
          const newInput = beforeAt + selected + " " + afterQuery;
          setInput(newInput);
          setCursor(beforeAt.length + selected.length + 1);
        }
        setFilePicker(null);
        return;
      }

      applyKey(char, key);

      const currentInput = inputRef.current;
      const atPos = filePicker.atPosition;
      const newQuery = getFilePickerQuery(currentInput, atPos, cursorRef.current);
      if (newQuery === null) {
        setFilePicker(null);
        return;
      }

      setFilePicker(prev => prev && ({ ...prev, query: newQuery, selectedIndex: 0 }));
      return;
    }

    if (isCtrlE(char, key) && hasToggleableObservation(uiState.logs)) {
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

    applyKey(char, key);

    if (char === "@" && !filePicker) {
      void loadFileList();
      setFilePicker({ query: "", selectedIndex: 0, atPosition: cursorRef.current - 1 });
    }
  });

  useEffect(() => {
    const handler = async (request: PermissionRequest) => new Promise<PermissionPromptChoice>((resolve) => {
      setPermissionPrompt({ request, resolve });
    });

    permissionController.setPromptHandler(handler);
    return () => {
      permissionController.setPromptHandler(null);
    };
  }, [permissionController]);

  return (
    <Box flexDirection="column" paddingX={1}>
      <ConsoleHeader hint={hint} snapshot={uiState.latestSnapshot} />
      <ConsoleLogList logs={uiState.logs} thinkingTick={uiState.thinkingTick} />
      {permissionPrompt ? <PermissionPromptBox request={permissionPrompt.request} /> : null}
      <ConsoleInputBar
        input={input}
        cursor={cursor}
        busy={uiState.busy}
        pickerFiles={filePicker ? filteredFiles : []}
        pickerSelectedIndex={filePicker?.selectedIndex ?? 0}
      />
    </Box>
  );
}
