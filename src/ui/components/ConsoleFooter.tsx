import React from "react";
import { Box, Text } from "ink";
import type { TokenUsage } from "../../core/messageTypes.js";
import { formatTotalTokenUsageText } from "../utils/tokenUsage.js";

export function ConsoleFooter({
  modelName,
  tokenUsage
}: {
  modelName: string;
  tokenUsage: TokenUsage | null;
}) {
  return (
    <Box justifyContent="space-between" marginTop={0}>
      <Text color="gray">Model  {modelName}</Text>
      <Text color="gray">Tokens  {formatTotalTokenUsageText(tokenUsage)}</Text>
    </Box>
  );
}
