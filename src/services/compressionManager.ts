import type { AgentStep, Message } from "../core/messageTypes.js";
import type { ContextCompressionConfig } from "../core/runtimeConfig.js";
import type { WorkingMemory } from "../core/toolTypes.js";

interface CompressionResult {
  stepsForPrompt: AgentStep[];
  workingMemory: WorkingMemory | null;
  compressed: boolean;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

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

function compressCommandObservation(observation: string): string {
  const lines = observation.split("\n");
  if (lines.length <= 70) {
    return observation;
  }
  const head = lines.slice(0, 20);
  const tail = lines.slice(-40);
  const errorLines = lines.filter((line) => /error|failed|exception/i.test(line)).slice(0, 10);
  return [...head, "...(compressed)...", ...errorLines, "...(tail)...", ...tail].join("\n");
}

function buildWorkingMemory(messages: Message[], oldSteps: AgentStep[], recentSteps: AgentStep[]): WorkingMemory {
  const goal = messages[messages.length - 1]?.content ?? "Complete the current coding task.";
  const touchedFiles = extractTouchedFiles(oldSteps);
  const decisions = oldSteps
    .map((step) => step.thought.trim())
    .filter(Boolean)
    .slice(0, 8);
  const openIssues = oldSteps
    .map((step) => step.observation ?? "")
    .filter((obs) => /error/i.test(obs))
    .slice(0, 8);
  const nextAction = recentSteps[0]?.thought || "Continue with the highest-priority open issue.";

  return {
    goal,
    decisions,
    touchedFiles,
    openIssues,
    nextAction: nextAction || "Continue with the highest-priority open issue."
  };
}

export class CompressionManager {
  constructor(private readonly config: ContextCompressionConfig) {}

  maybeCompress(messages: Message[], steps: AgentStep[], previousMemory: WorkingMemory | null): CompressionResult {
    if (!this.config.enabled || steps.length < 4) {
      return { stepsForPrompt: steps, workingMemory: previousMemory, compressed: false };
    }

    const textBlob = [
      messages.map((m) => m.content).join("\n"),
      steps.map((s) => `${s.thought}\n${s.observation ?? ""}`).join("\n")
    ].join("\n");
    const estimated = estimateTokens(textBlob);
    const threshold = Math.floor(this.config.contextTokenBudget * this.config.tokenThresholdRatio);

    if (estimated <= threshold) {
      return { stepsForPrompt: steps, workingMemory: previousMemory, compressed: false };
    }

    const retainCount = Math.max(2, Math.floor(steps.length * this.config.retainRecentRatio));
    const oldSteps = steps.slice(0, Math.max(0, steps.length - retainCount));
    const recentSteps = steps.slice(steps.length - retainCount).map((step) => ({
      ...step,
      observation: step.observation ? compressCommandObservation(step.observation) : step.observation
    }));
    const workingMemory = buildWorkingMemory(messages, oldSteps, recentSteps);

    if (!workingMemory.nextAction) {
      return { stepsForPrompt: steps, workingMemory: previousMemory, compressed: false };
    }

    return { stepsForPrompt: recentSteps, workingMemory, compressed: true };
  }
}

