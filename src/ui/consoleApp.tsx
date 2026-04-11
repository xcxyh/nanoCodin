import React from "react";
import { Box, useApp } from "ink";
import type { CodingAgentGraph } from "../agent/agentGraph.js";
import type { AskUserQuestionController } from "../core/askUserQuestion.js";
import type { PermissionController } from "../core/permission.js";
import type { SessionCheckpointStore } from "../core/toolTypes.js";
import { AskUserQuestionBox } from "./components/AskUserQuestionBox.js";
import { ConsoleFooter } from "./components/ConsoleFooter.js";
import { ConsoleHeader } from "./components/ConsoleHeader.js";
import { ConsoleInputBar } from "./components/ConsoleInputBar.js";
import { ConsoleMessagePane } from "./components/ConsoleMessagePane.js";
import { ConsoleTodoPane } from "./components/ConsoleTodoPane.js";
import { useAskUserQuestion } from "./hooks/useAskUserQuestion.js";
import { useConsoleBootstrap } from "./hooks/useConsoleBootstrap.js";
import { useConsoleKeyboard } from "./hooks/useConsoleKeyboard.js";
import { useConsoleTaskRunner } from "./hooks/useConsoleTaskRunner.js";
import { useExitArm } from "./hooks/useExitArm.js";
import type { SlashCommandItem } from "./utils/slashCommands.js";

interface Props {
  graph: CodingAgentGraph;
  permissionController: PermissionController;
  questionController: AskUserQuestionController;
  modelName: string;
  version: string;
  cwd: string;
  checkpoint?: SessionCheckpointStore;
  slashCommands: SlashCommandItem[];
  initialTask?: string;
  resumeSessionId?: string;
  disableCheckpointRestore?: boolean;
}

export function ConsoleApp({ graph, permissionController, questionController, modelName, version, cwd, checkpoint, slashCommands, initialTask, resumeSessionId, disableCheckpointRestore }: Props) {
  const { exit } = useApp();
  const { exitArmedAt, clearExitArm, shouldExit } = useExitArm();
  const { activeQuestion, setActiveQuestion } = useAskUserQuestion(questionController);
  const { uiState, runTask, requestCancel, clearSession } = useConsoleTaskRunner({
    graph,
    checkpoint,
    resumeSessionId,
    disableCheckpointRestore
  });

  const keyboard = useConsoleKeyboard({
    busy: uiState.busy,
    activeQuestion,
    updateActiveQuestion: setActiveQuestion,
    clearActiveQuestion: () => setActiveQuestion(null),
    slashCommands,
    onSubmit: (task) => {
      void runTask(task);
    },
    onClearSession: () => {
      void clearSession();
    },
    onCancel: requestCancel,
    onExit: () => {
      if (shouldExit()) {
        exit();
      }
    },
    onQuit: () => {
      exit();
    },
    clearExitArm
  });

  useConsoleBootstrap({
    initialTask,
    resumeSessionId,
    runTask
  });

  const hint = activeQuestion
    ? `Use Up/Down to choose, Enter to confirm.${activeQuestion.request.options.some((option) => option.shortcutKey) ? " Shortcut keys are also available." : ""}`
    : keyboard.filePickerActive
      ? "Type to filter. Up/Down to navigate, Enter to select, Esc to cancel."
      : keyboard.commandPickerActive
        ? "Type a slash command. Up/Down to navigate, Enter to insert, Esc to cancel."
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
      {activeQuestion ? <AskUserQuestionBox request={activeQuestion.request} selectedIndex={activeQuestion.selectedIndex} /> : null}
      <ConsoleInputBar
        input={keyboard.input}
        cursor={keyboard.cursor}
        busy={uiState.busy}
        pickerFiles={keyboard.filteredFiles}
        commandSuggestions={keyboard.filteredCommands}
        pickerSelectedIndex={keyboard.pickerSelectedIndex}
      />
      <ConsoleFooter modelName={modelName} tokenUsage={uiState.latestSnapshot?.tokenUsage ?? null} />
    </Box>
  );
}
