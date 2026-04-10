import React from "react";
import { Box, Text } from "ink";
import type { CompletedTurn, CurrentTurn } from "../state/transcript.js";
import { BRAND_COLOR } from "./ConsoleHeader.js";

function resultColor(status: CompletedTurn["status"]): string {
  if (status === "error") {
    return "red";
  }
  if (status === "cancelled") {
    return "yellow";
  }
  return BRAND_COLOR;
}

export function ConsoleMessagePane({
  history,
  currentTurn,
  busy,
  pendingToolName
}: {
  history: CompletedTurn[];
  currentTurn: CurrentTurn | null;
  busy: boolean;
  pendingToolName: string | null;
}) {
  const visibleHistory = history.slice(-10);

  return (
    <Box flexDirection="column" marginBottom={1}>
      {visibleHistory.map((turn) => (
        <Box key={turn.id} flexDirection="column" marginBottom={2}>
          <Text color="white">❯ {turn.user}</Text>
          <Text color={resultColor(turn.status)}>⏺ {turn.result}</Text>
        </Box>
      ))}

      {currentTurn ? (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text color="white">❯ {currentTurn.user}</Text>
          </Box>
          {currentTurn.activity.map((entry) => (
            <Box key={entry.id} flexDirection="column" marginBottom={1}>
              <Text color={entry.kind === "error" ? "red" : entry.kind === "thinking" ? "white" : "gray"}>
                ⏺ {entry.text}
              </Text>
              {entry.detail ? (
                <Text color="gray">  └─ {entry.detail}</Text>
              ) : null}
            </Box>
          ))}
          {busy ? (
            <Box marginBottom={1}>
              <Text color="gray">⏺ {pendingToolName ? `Running ${pendingToolName}...` : "Loading..."}</Text>
            </Box>
          ) : null}
          {currentTurn.finalText ? (
            <Text color={BRAND_COLOR}>⏺ {currentTurn.finalText}</Text>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}
