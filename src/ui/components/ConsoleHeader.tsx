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
  cwd
}: {
  hint: string;
  version: string;
  modelName: string;
  cwd: string;
}) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Box flexDirection="column" marginRight={2}>
          {MASCOT_LINES.map((line) => (
            <Text key={line} color={BRAND_COLOR}>{line}</Text>
          ))}
        </Box>
        <Box flexDirection="column">
          <Text color="white">Nano Codin v{version}</Text>
          <Text color="gray">{modelName}</Text>
          <Text color="gray">{cwd}</Text>
        </Box>
      </Box>
      <Text color="gray">{hint}</Text>
    </Box>
  );
}
