// Importing the Harness does not load Ink, model providers, shell tools, or user config.
import { createAgentRuntime, type AgentOptions } from "./agent/run.js";
import { codingHistoryHints, requireVerification } from "./coding/verification.js";

export function createAgent(options: AgentOptions) {
  return createAgentRuntime(options, {
    historyHints: options.beforeFinish === requireVerification ? codingHistoryHints : undefined
  });
}
export type { Agent, AgentOptions, Model, RunOptions, RunResult } from "./agent/run.js";
export { defineTool, ToolExecutionError, ToolRegistry } from "./agent/tools.js";
export type { Tool, ToolContext, ToolResult, ToolOutput, PlanItem, CommandEvidence } from "./agent/tools.js";
export type { Message, ModelResponse, ModelFailure, RequestInfo, TokenUsage, ToolCall } from "./agent/messages.js";
export type { Session, AgentEvent, ToolOutputEvent, RunStatus } from "./agent/session.js";
export type { AskUserQuestionRequest } from "./agent/question.js";
export { projectSession, requireVerification } from "./coding/verification.js";
export { ModelRequestError } from "./agent/messages.js";
