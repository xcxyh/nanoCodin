import type { ModelFailure, RequestInfo, TokenUsage, ToolCall } from "../core/messageTypes.js";
import type { ToolOutput, ToolResult } from "../core/toolTypes.js";

export type RunStatus = "complete" | "incomplete" | "error" | "cancelled";
export type AgentEvent = { at: number } & (
  | { type: "user"; text: string; continuation: boolean }
  | { type: "model_start"; requestId: string; round: number }
  | { type: "model_end"; requestId: string; status: "complete" | "error" | "cancelled"; request?: RequestInfo; failure?: ModelFailure; providerData?: Record<string, unknown> }
  | { type: "usage"; usage: TokenUsage }
  | { type: "tool_start"; callId: string; call: ToolCall; mutates?: boolean }
  | { type: "tool_end"; callId: string; call: ToolCall; result: ToolResult }
  | { type: "notice"; text: string; kind?: "persistence" }
  | { type: "finish"; status: RunStatus; answer: string; failure?: ModelFailure }
);

/** Live display data; the final tool_end remains authoritative. */
export type ToolOutputEvent = ToolOutput & { at: number; callId: string };

/** The only persisted runtime state. UI, prompts and workflows derive their views from it. */
export interface Session {
  version: 1;
  id: string;
  cwd: string;
  createdAt: number;
  events: AgentEvent[];
}
