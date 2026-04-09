import type { TokenUsage } from "../../core/messageTypes.js";

function trimTrailingZeros(value: string): string {
  return value.replace(/\.0+$|(\.\d*?)0+$/g, "$1");
}

export function formatTokenCountK(tokens: number): string {
  const kiloTokens = Math.round((tokens / 1000) * 100) / 100;
  return `${trimTrailingZeros(kiloTokens.toFixed(2))}k`;
}

export function formatTokenUsageText(tokenUsage: TokenUsage | null): string | null {
  if (!tokenUsage) {
    return null;
  }

  const sourceSuffix = tokenUsage.source === "actual"
    ? ""
    : ` (${tokenUsage.source})`;

  return `Tokens: ${formatTokenCountK(tokenUsage.promptTokens)} input / ${formatTokenCountK(tokenUsage.completionTokens)} output / ${formatTokenCountK(tokenUsage.totalTokens)} total tokens${sourceSuffix}`;
}

export function formatTotalTokenUsageText(tokenUsage: TokenUsage | null): string {
  if (!tokenUsage || tokenUsage.totalTokens === 0) {
    return "0";
  }

  const sourceSuffix = tokenUsage.source === "actual"
    ? ""
    : ` (${tokenUsage.source})`;

  return `${formatTokenCountK(tokenUsage.totalTokens)}${sourceSuffix}`;
}

export function formatTaskCompletedText(stepCount: number, tokenUsage: TokenUsage | null): string {
  if (!tokenUsage) {
    return `Completed in ${stepCount} step(s).`;
  }

  return `Completed in ${stepCount} step(s). ${formatTokenCountK(tokenUsage.totalTokens)} tokens.`;
}
