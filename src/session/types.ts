import type { TokenUsage, ToolCall } from "../core/messageTypes.js";
import type { ToolResult } from "../core/toolTypes.js";

export type RunStatus = "complete" | "incomplete" | "error" | "cancelled";
export type AgentEvent = { at: number } & (
  | { type: "user"; text: string; continuation: boolean }
  | { type: "usage"; usage: TokenUsage }
  | { type: "tool_start"; callId: string; call: ToolCall }
  | { type: "tool_end"; callId: string; call: ToolCall; result: ToolResult }
  | { type: "notice"; text: string }
  | { type: "finish"; status: RunStatus; answer: string }
);

/** The only persisted runtime state. UI, prompts and workflows derive their views from it. */
export interface Session {
  version: 1;
  id: string;
  cwd: string;
  createdAt: number;
  events: AgentEvent[];
}
