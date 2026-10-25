export type Role = "system" | "user" | "assistant" | "tool";

export interface Message {
  role: Role;
  content: string;
  name?: string;
  toolCalls?: Array<ToolCall & { id: string }>;
  toolCallId?: string;
  /** Opaque provider continuation data; never user-facing reasoning. */
  providerData?: Record<string, unknown>;
}

export interface ToolCall {
  id?: string;
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

export interface RequestInfo {
  attempts: number;
  durationMs: number;
  receivedBytes: number;
  firstResponseMs?: number;
  lastResponseMs?: number;
  requestId?: string;
  httpStatus?: number;
}
export interface ModelFailure extends RequestInfo {
  kind: "timeout" | "cancelled" | "auth" | "rate_limit" | "network" | "provider" | "protocol";
  retryable: boolean;
  detail?: string;
  timeoutScope?: "total" | "idle";
}
export class ModelRequestError extends Error {
  constructor(message: string, readonly failure: ModelFailure, options?: ErrorOptions) { super(message, options); this.name = "ModelRequestError"; }
}

export interface ModelResponse {
  providerData?: Record<string, unknown>;
  request?: RequestInfo;
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
