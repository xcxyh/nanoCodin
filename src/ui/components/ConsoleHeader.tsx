import React from "react";
import { Box, Text } from "ink";

export const BRAND_COLOR = "#38bdf8";

const MASCOT_LINES = [
  "███╗   ██╗ █████╗ ███╗   ██╗ ██████╗ ",
  "████╗  ██║██╔══██╗████╗  ██║██╔═══██╗",
  "██╔██╗ ██║███████║██╔██╗ ██║██║   ██║",
  "██║╚██╗██║██╔══██║██║╚██╗██║██║   ██║",
  "██║ ╚████║██║  ██║██║ ╚████║╚██████╔╝",
  "╚═╝  ╚═══╝╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝ ",
  "",
  " ██████╗ ██████╗ ██████╗ ██╗███╗   ██╗",
  "██╔════╝██╔═══██╗██╔══██╗██║████╗  ██║",
  "██║     ██║   ██║██║  ██║██║██╔██╗ ██║",
  "██║     ██║   ██║██║  ██║██║██║╚██╗██║",
  "╚██████╗╚██████╔╝██████╔╝██║██║ ╚████║",
  " ╚═════╝ ╚═════╝ ╚═════╝ ╚═╝╚═╝  ╚═══╝"
];

export function ConsoleHeader({
  hint,
  version,
  modelName,
  cwd,
  compact = false
}: {
  hint: string;
  version: string;
  modelName: string;
  cwd: string;
  compact?: boolean;
}) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      {!compact ? <Box>
        <Box flexDirection="column" marginRight={2} flexShrink={0} width={Math.max(...MASCOT_LINES.map((line) => line.length))}>
          {MASCOT_LINES.map((line) => (
            <Text key={line} color={BRAND_COLOR}>{line}</Text>
          ))}
        </Box>
        <Box flexDirection="column" flexGrow={1} flexShrink={1}>
          <Text color="white">Nano Codin v{version}</Text>
          <Text color="gray">{modelName}</Text>
          <Text color="gray" wrap="truncate-middle">{cwd}</Text>
        </Box>
      </Box> : <Text color={BRAND_COLOR}>Nano Codin v{version} · {modelName}</Text>}
      {compact ? <Text color="gray">{cwd}</Text> : null}
      <Text color="gray">{hint}</Text>
    </Box>
  );
}
