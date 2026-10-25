import React from "react";
import { Box, Text } from "ink";
import type { TokenUsage } from "../../core/messageTypes.js";

export function formatTotalTokenUsageText(usage: TokenUsage | null): string {
  if (!usage?.totalTokens) return "0";
  const count = (usage.totalTokens / 1000).toFixed(2).replace(/\.?0+$/, "");
  return `${count}k${usage.source === "actual" ? "" : ` (${usage.source})`}`;
}
export function ConsoleFooter({ modelName, tokenUsage }: { modelName: string; tokenUsage: TokenUsage | null }) {
  return <Box justifyContent="space-between">
    <Text color="gray">Model  {modelName}</Text>
    <Text color="gray">Tokens  {formatTotalTokenUsageText(tokenUsage)}</Text>
  </Box>;
}
