import type { AgentStep, Message } from "../core/messageTypes.js";
import type { SessionMemory } from "../core/toolTypes.js";

function extractTouchedFiles(steps: AgentStep[]): string[] {
  const files = new Set<string>();
  for (const step of steps) {
    const input = step.action?.input;
    if (input && typeof input === "object" && input !== null && "path" in input) {
      const pathValue = (input as { path?: unknown }).path;
      if (typeof pathValue === "string") {
        files.add(pathValue);
      }
    }
  }
  return [...files].slice(0, 20);
}

function compactObservation(observation: string): string {
  return observation.split("\n").map((line) => line.trim()).find(Boolean) ?? observation.trim();
}

function inferGoal(messages: Message[]): string {
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user" && message.content.trim().length > 0);
  if (latestUserMessage) {
    return latestUserMessage.content;
  }

  const latestNonToolMessage = [...messages].reverse().find((message) => message.role !== "tool" && message.content.trim().length > 0);
  if (latestNonToolMessage) {
    return latestNonToolMessage.content;
  }

  return "Complete the current coding task.";
}

export function buildSessionMemory(messages: Message[], oldSteps: AgentStep[], recentSteps: AgentStep[]): SessionMemory {
  const goal = inferGoal(messages);
  const touchedFiles = extractTouchedFiles([...oldSteps, ...recentSteps]);
  const decisions = oldSteps
    .map((step) => step.thought.trim())
    .filter(Boolean)
    .slice(0, 8);
  const pendingVerification = [...oldSteps, ...recentSteps]
    .map((step) => step.observation ?? "")
    .filter((observation) => /verification required|run test|typecheck|lint|build/i.test(observation))
    .map((observation) => compactObservation(observation))
    .slice(0, 6);
  const failureNotes = oldSteps
    .map((step) => step.observation ?? "")
    .filter((observation) => /error|failed|exception/i.test(observation))
    .map((observation) => compactObservation(observation))
    .slice(0, 8);
  const nextAction = recentSteps[0]?.thought || "Continue with the highest-priority open issue.";

  return {
    goal,
    decisions,
    touchedFiles,
    pendingVerification,
    failureNotes,
    nextAction: nextAction || "Continue with the highest-priority open issue."
  };
}
