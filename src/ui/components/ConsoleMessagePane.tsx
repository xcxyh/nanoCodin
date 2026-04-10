import React from "react";
import { Box, Text } from "ink";
import type { CompletedTurn, CurrentTurn } from "../state/transcript.js";
import { BRAND_COLOR } from "./ConsoleHeader.js";

const LOADING_SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function resultColor(status: CompletedTurn["status"]): string {
  if (status === "error") {
    return "red";
  }
  if (status === "cancelled") {
    return "yellow";
  }
  return BRAND_COLOR;
}

function useAnimatedFrame(active: boolean, frameCount: number, intervalMs: number): number {
  const [frame, setFrame] = React.useState(0);

  React.useEffect(() => {
    if (!active || frameCount <= 1) {
      setFrame(0);
      return;
    }

    const timer = setInterval(() => {
      setFrame((current) => (current + 1) % frameCount);
    }, intervalMs);

    return () => {
      clearInterval(timer);
    };
  }, [active, frameCount, intervalMs]);

  return frame;
}

function shimmerColor(distance: number): string {
  if (distance === 0) {
    return BRAND_COLOR;
  }
  if (distance === 1) {
    return "#7dd3fc";
  }
  if (distance === 2) {
    return "white";
  }
  return "gray";
}

function LoadingStatus({ label }: { label: string }) {
  // Use one clock for all loading motion to avoid out-of-phase terminal repaints.
  const frame = useAnimatedFrame(true, LOADING_SPINNER_FRAMES.length * 3, 90);
  const spinnerFrame = frame % LOADING_SPINNER_FRAMES.length;
  const shimmerLead = frame % (label.length + 6);

  return (
    <Box marginBottom={1}>
      <Text color="gray">⏺ </Text>
      <Text color={BRAND_COLOR}>{LOADING_SPINNER_FRAMES[spinnerFrame]}</Text>
      <Text color="gray"> </Text>
      <Box>
        {Array.from(label).map((char, index) => (
          <Text key={`label-${index}-${char}`} color={shimmerColor(Math.abs(index - shimmerLead))}>
            {char}
          </Text>
        ))}
      </Box>
    </Box>
  );
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
            <LoadingStatus label={pendingToolName ? `Running ${pendingToolName}...` : "Thinking..."} />
          ) : null}
          {currentTurn.finalText ? (
            <Text color={BRAND_COLOR}>⏺ {currentTurn.finalText}</Text>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}
