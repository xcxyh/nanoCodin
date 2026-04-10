import React from "react";
import { Box, useApp } from "ink";
import type { CodingAgentGraph } from "../agent/agentGraph.js";
import type { PermissionController } from "../core/permission.js";
import { ConsoleFooter } from "./components/ConsoleFooter.js";
import { ConsoleHeader } from "./components/ConsoleHeader.js";
import { ConsoleInputBar } from "./components/ConsoleInputBar.js";
import { ConsoleMessagePane } from "./components/ConsoleMessagePane.js";
import { ConsoleTodoPane } from "./components/ConsoleTodoPane.js";
import { PermissionPromptBox } from "./components/PermissionPromptBox.js";
import { useConsoleBootstrap } from "./hooks/useConsoleBootstrap.js";
import { useConsoleKeyboard } from "./hooks/useConsoleKeyboard.js";
import { useConsoleTaskRunner } from "./hooks/useConsoleTaskRunner.js";
import { useExitArm } from "./hooks/useExitArm.js";
import { usePermissionPrompt } from "./hooks/usePermissionPrompt.js";

interface Props {
  graph: CodingAgentGraph;
  permissionController: PermissionController;
  modelName: string;
  version: string;
  cwd: string;
  initialTask?: string;
  resumeSessionId?: string;
  disableCheckpointRestore?: boolean;
}

export function ConsoleApp({ graph, permissionController, modelName, version, cwd, initialTask, resumeSessionId, disableCheckpointRestore }: Props) {
  const { exit } = useApp();
  const { exitArmedAt, clearExitArm, shouldExit } = useExitArm();
  const { permissionPrompt, setPermissionPrompt } = usePermissionPrompt(permissionController);
  const { uiState, runTask, requestCancel } = useConsoleTaskRunner({
    graph,
    resumeSessionId,
    disableCheckpointRestore
  });

  const keyboard = useConsoleKeyboard({
    busy: uiState.busy,
    permissionPrompt,
    clearPermissionPrompt: () => setPermissionPrompt(null),
    onSubmit: (task) => {
      void runTask(task);
    },
    onCancel: requestCancel,
    onExit: () => {
      if (shouldExit()) {
        exit();
      }
    },
    clearExitArm
  });

  useConsoleBootstrap({
    initialTask,
    resumeSessionId,
    runTask
  });

  const hint = permissionPrompt
    ? "Permission required. Press Y to allow once, A to allow all, N to deny."
    : keyboard.filePickerActive
      ? "Type to filter. Up/Down to navigate, Enter to select, Esc to cancel."
      : uiState.busy
        ? (uiState.cancelRequested ? "Cancelling current task..." : "Running current task. Press ESC to cancel.")
        : exitArmedAt
          ? "Press Ctrl+C again to exit."
          : "Enter a task and press Enter. Use @ to insert file paths.";

  return (
    <Box flexDirection="column" paddingX={1}>
      <ConsoleHeader hint={hint} version={version} modelName={modelName} cwd={cwd} />
      <ConsoleMessagePane
        history={uiState.history}
        currentTurn={uiState.currentTurn}
        busy={uiState.busy}
        pendingToolName={uiState.pendingToolName}
      />
      <ConsoleTodoPane snapshot={uiState.latestSnapshot} visible={uiState.busy} />
      {permissionPrompt ? <PermissionPromptBox request={permissionPrompt.request} /> : null}
      <ConsoleInputBar
        input={keyboard.input}
        cursor={keyboard.cursor}
        busy={uiState.busy}
        pickerFiles={keyboard.filteredFiles}
        pickerSelectedIndex={keyboard.pickerSelectedIndex}
      />
      <ConsoleFooter modelName={modelName} tokenUsage={uiState.latestSnapshot?.tokenUsage ?? null} />
    </Box>
  );
}
