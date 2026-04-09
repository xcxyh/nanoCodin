import React from "react";
import { Box, Text } from "ink";

export const BRAND_COLOR = "#38bdf8";

export function ConsoleHeader({ hint }: { hint: string }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={BRAND_COLOR}>Nano Codin</Text>
      <Text color="gray">{hint}</Text>
    </Box>
  );
}
