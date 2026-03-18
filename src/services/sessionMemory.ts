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

export function buildSessionMemory(messages: Message[], oldSteps: AgentStep[], recentSteps: AgentStep[]): SessionMemory {
  const goal = messages[messages.length - 1]?.content ?? "Complete the current coding task.";
  const touchedFiles = extractTouchedFiles([...oldSteps, ...recentSteps]);
  const decisions = oldSteps
    .map((step) => step.thought.trim())
    .filter(Boolean)
    .slice(0, 8);
  const pendingVerification = [...oldSteps, ...recentSteps]
    .map((step) => step.observation ?? "")
    .filter((observation) => /verification required|run test|typecheck|lint|build/i.test(observation))
    .slice(0, 6);
  const failureNotes = oldSteps
    .map((step) => step.observation ?? "")
    .filter((observation) => /error|failed|exception/i.test(observation))
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
