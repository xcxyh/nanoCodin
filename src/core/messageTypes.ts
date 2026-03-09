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

export interface AgentStep {
  thought: string;
  action?: ToolCall;
  observation?: string;
  phase?: "discover" | "plan" | "execute" | "verify" | "finalize";
}

export interface ModelResponse {
  text: string;
}
