export type Role = "system" | "user" | "assistant" | "tool";

export interface Message {
  role: Role;
  content: string;
  name?: string;
}

export interface ToolCall {
  name: string;
  input: unknown;
}

export type TokenUsageSource = "actual" | "estimated" | "mixed";

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  source: TokenUsageSource;
}

export interface ModelResponse {
  error?: string;
  text: string;
  usage?: TokenUsage;
  toolCall?: ToolCall;
  toolCalls?: ToolCall[];
  finishReason?: string;
  structured?: boolean;
}

function mergeTokenUsageSource(left: TokenUsageSource, right: TokenUsageSource): TokenUsageSource {
  if (left === right) {
    return left;
  }
  return "mixed";
}

export function accumulateTokenUsage(left: TokenUsage | null, right: TokenUsage | null | undefined): TokenUsage | null {
  if (!right) {
    return left;
  }
  if (!left) {
    return right;
  }

  const promptTokens = left.promptTokens + right.promptTokens;
  const completionTokens = left.completionTokens + right.completionTokens;
  const totalTokens = left.totalTokens + right.totalTokens;

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    source: mergeTokenUsageSource(left.source, right.source)
  };
}
