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
  const verification = input.latestVerification ?? input.todos.verification.latestSummary ?? "(none)";
  const risks = input.sessionMemory?.failureNotes ?? [];
  const completedTodos = input.todos.items.filter((item) => item.completed).map((item) => item.content);
  const subtaskSummaries = input.subtasks.map((item) => `${item.status} ${item.task}: ${item.summary}`);

  return [
    `What changed: ${completedTodos.length > 0 ? completedTodos.join("; ") : "(none)"}`,
    `Touched files: ${changedFiles.length > 0 ? changedFiles.join(", ") : "(none)"}`,
    `How verified: goal=${input.todos.verification.goal || "(none)"}; commands=${input.todos.verification.commands.join(" | ") || "(none)"}; latest=${verification}`,
    `Residual risks: ${risks.length > 0 ? risks.join(" | ") : "(none)"}`,
    `Subtasks used: ${subtaskSummaries.length > 0 ? subtaskSummaries.join(" | ") : "(none)"}`
  ].join("\n");
}
