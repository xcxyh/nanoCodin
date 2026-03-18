import type { ToolCall } from "../core/messageTypes.js";
import type { SessionMemory, SubtaskResult, TodoState } from "../core/toolTypes.js";

export function isVerificationAction(action: ToolCall): boolean {
  if (action.name !== "bash") {
    return false;
  }
  const input = action.input as { command?: unknown };
  if (typeof input.command !== "string") {
    return false;
  }
  return /\b(test|lint|typecheck|build)\b/i.test(input.command);
}

export function classifyVerificationResult(observation: string): string {
  if (/error|failed|exception/i.test(observation)) {
    return "verification_failed";
  }
  return "verification_passed";
}

export function buildFinalSummary(input: {
  sessionMemory: SessionMemory | null;
  todos: TodoState;
  subtasks: SubtaskResult[];
  latestVerification: string | null;
}): string {
  const changedFiles = input.sessionMemory?.touchedFiles ?? [];
  const verification = input.latestVerification ?? "(none)";
  const risks = input.sessionMemory?.failureNotes ?? [];
  const completedTodos = input.todos.items.filter((item) => item.completed).map((item) => item.content);
  const subtaskSummaries = input.subtasks.map((item) => `${item.task}: ${item.summary}`);

  return [
    `Completed todo items: ${completedTodos.length > 0 ? completedTodos.join("; ") : "(none)"}`,
    `Touched files: ${changedFiles.length > 0 ? changedFiles.join(", ") : "(none)"}`,
    `Verification: ${verification}`,
    `Subtasks: ${subtaskSummaries.length > 0 ? subtaskSummaries.join(" | ") : "(none)"}`,
    `Residual risks: ${risks.length > 0 ? risks.join(" | ") : "(none)"}`
  ].join("\n");
}
