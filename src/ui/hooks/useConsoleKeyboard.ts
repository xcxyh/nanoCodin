import { useInput } from "ink";
import path from "node:path";
import { useRef, useState } from "react";
import type { PermissionPromptChoice } from "../../core/permission.js";
import { collectFiles } from "../../tools/fs/grep.js";
import {
  buildSlashCommandTemplate,
  filterSlashCommands,
  getSlashCommandQuery,
  resolveSlashSubmission,
  type SlashCommandItem
} from "../utils/slashCommands.js";
import { clampFilePickerIndex, getFilePickerQuery } from "../utils/filePicker.js";
import { isCtrlC, useConsoleInput, type InputKey } from "../useConsoleInput.js";

interface FilePickerState {
  query: string;
  selectedIndex: number;
  atPosition: number;
}

interface CommandPickerState {
  query: string;
  selectedIndex: number;
}

function resolvePermissionChoice(char: string): PermissionPromptChoice | null {
  const normalized = char.toLowerCase();
  if (normalized === "y") return "allow_once";
  if (normalized === "a") return "allow_all";
  if (normalized === "n") return "deny";
  return null;
}

function filterFiles(files: string[], filePicker: FilePickerState | null): string[] {
  if (!filePicker) {
    return [];
  }

  const query = filePicker.query.toLowerCase();
  return files
    .filter((file) => query === "" || file.toLowerCase().includes(query))
    .slice(0, 10);
}

export function useConsoleKeyboard({
  busy,
  permissionPrompt,
  clearPermissionPrompt,
  slashCommands,
  onSubmit,
  onClearSession,
  onCancel,
  onExit,
  onQuit,
  clearExitArm
}: {
  busy: boolean;
  permissionPrompt: { resolve: (choice: PermissionPromptChoice) => void } | null;
  clearPermissionPrompt: () => void;
  slashCommands: SlashCommandItem[];
  onSubmit: (task: string) => void;
  onClearSession: () => void;
  onCancel: () => void;
  onExit: () => void;
  onQuit: () => void;
  clearExitArm: () => void;
}) {
  const inputState = useConsoleInput();
  const [filePicker, setFilePicker] = useState<FilePickerState | null>(null);
  const [commandPicker, setCommandPicker] = useState<CommandPickerState | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const filesLoadedRef = useRef(false);
  const loadingPromiseRef = useRef<Promise<void> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  async function loadFileList() {
    if (filesLoadedRef.current) {
      return;
    }
    if (loadingPromiseRef.current) {
      return;
    }

    // 取消之前的加载请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    const promise = (async () => {
      const cwd = process.cwd();
      // 添加超时和最大文件数限制
      const timeoutPromise = new Promise<string[]>((_, reject) => {
        setTimeout(() => reject(new Error("Timeout")), 3000);
      });

      try {
        const absolutePaths = await Promise.race([
          collectFiles(cwd, 100),
          timeoutPromise
        ]);

        if (signal.aborted) return;

        setFiles(absolutePaths.map((file) => path.relative(cwd, file)).sort());
        filesLoadedRef.current = true;
      } catch (error) {
        if (!signal.aborted) {
          // 超时或错误时，设置空列表避免卡死
          setFiles([]);
          filesLoadedRef.current = true;
        }
      }
    })();

    loadingPromiseRef.current = promise;
    try {
      await promise;
    } finally {
      loadingPromiseRef.current = null;
    }
  }

  const filteredFiles = filterFiles(files, filePicker);
  const filteredCommands = commandPicker ? filterSlashCommands(slashCommands, commandPicker.query).slice(0, 10) : [];

  function syncCommandPicker() {
    const nextQuery = getSlashCommandQuery(inputState.inputRef.current, inputState.cursorRef.current);
    if (nextQuery === null) {
      setCommandPicker(null);
      return;
    }

    setCommandPicker((prev) => ({
      query: nextQuery,
      selectedIndex: prev ? clampFilePickerIndex(prev.selectedIndex, filterSlashCommands(slashCommands, nextQuery).length) : 0
    }));
  }

  function executeBuiltinCommand(commandName: string) {
    if (commandName === "clear") {
      inputState.reset();
      onClearSession();
      return;
    }

    if (commandName === "quit") {
      inputState.reset();
      onQuit();
    }
  }

  useInput((char, key: InputKey & {
    escape?: boolean;
    upArrow?: boolean;
    downArrow?: boolean;
  }) => {
    if (key.escape) {
      if (commandPicker) {
        setCommandPicker(null);
        return;
      }
      if (filePicker) {
        setFilePicker(null);
        return;
      }
      if (busy) {
        onCancel();
      }
      return;
    }

    if (isCtrlC(char, key)) {
      if (commandPicker) {
        setCommandPicker(null);
        return;
      }
      if (filePicker) {
        setFilePicker(null);
        return;
      }
      onExit();
      return;
    }

    if (permissionPrompt) {
      const choice = resolvePermissionChoice(char);
      if (choice) {
        permissionPrompt.resolve(choice);
        clearPermissionPrompt();
      }
      return;
    }

    if (busy) {
      return;
    }

    clearExitArm();

    if (filePicker) {
      if (key.upArrow) {
        setFilePicker((prev) => prev && ({
          ...prev,
          selectedIndex: clampFilePickerIndex(prev.selectedIndex - 1, filteredFiles.length)
        }));
        return;
      }

      if (key.downArrow) {
        setFilePicker((prev) => prev && ({
          ...prev,
          selectedIndex: clampFilePickerIndex(prev.selectedIndex + 1, filteredFiles.length)
        }));
        return;
      }

      if (key.return) {
        if (filteredFiles.length > 0) {
          const selectedIndex = clampFilePickerIndex(filePicker.selectedIndex, filteredFiles.length);
          const selected = filteredFiles[selectedIndex] ?? filteredFiles[0];
          const beforeAt = inputState.inputRef.current.slice(0, filePicker.atPosition);
          const afterQuery = inputState.inputRef.current.slice(filePicker.atPosition + 1 + filePicker.query.length);
          const nextInput = `${beforeAt}${selected} ${afterQuery}`;
          inputState.setInput(nextInput);
          inputState.setCursor(beforeAt.length + selected.length + 1);
        }
        setFilePicker(null);
        return;
      }

      inputState.applyKey(char, key);
      setCommandPicker(null);
      const nextQuery = getFilePickerQuery(inputState.inputRef.current, filePicker.atPosition, inputState.cursorRef.current);
      if (nextQuery === null) {
        setFilePicker(null);
        return;
      }

      setFilePicker((prev) => prev && ({
        ...prev,
        query: nextQuery,
        selectedIndex: 0
      }));
      return;
    }

    if (commandPicker) {
      if (key.upArrow) {
        setCommandPicker((prev) => prev && ({
          ...prev,
          selectedIndex: clampFilePickerIndex(prev.selectedIndex - 1, filteredCommands.length)
        }));
        return;
      }

      if (key.downArrow) {
        setCommandPicker((prev) => prev && ({
          ...prev,
          selectedIndex: clampFilePickerIndex(prev.selectedIndex + 1, filteredCommands.length)
        }));
        return;
      }

      if (key.return && filteredCommands.length > 0) {
        const selectedIndex = clampFilePickerIndex(commandPicker.selectedIndex, filteredCommands.length);
        const selected = filteredCommands[selectedIndex] ?? filteredCommands[0];
        const nextInput = buildSlashCommandTemplate(selected);
        inputState.setInput(nextInput);
        inputState.setCursor(nextInput.length);
        setCommandPicker(null);
        setFilePicker(null);
        return;
      }
    }

    if (key.return) {
      const task = inputState.input.trim();
      if (task.length === 0) {
        return;
      }

      const resolved = resolveSlashSubmission(task, slashCommands);
      inputState.reset();
      setCommandPicker(null);
      if (resolved.kind === "builtin" && resolved.commandName) {
        executeBuiltinCommand(resolved.commandName);
        return;
      }

      onSubmit(resolved.task ?? task);
      return;
    }

    inputState.applyKey(char, key);

    if (char === "@") {
      void loadFileList();
      setCommandPicker(null);
      setFilePicker({
        query: "",
        selectedIndex: 0,
        atPosition: inputState.cursorRef.current - 1
      });
      return;
    }

    syncCommandPicker();
  });

  return {
    input: inputState.input,
    cursor: inputState.cursor,
    filePickerActive: filePicker !== null,
    commandPickerActive: commandPicker !== null,
    filteredFiles,
    filteredCommands,
    pickerSelectedIndex: filePicker?.selectedIndex ?? commandPicker?.selectedIndex ?? 0
  };
}
