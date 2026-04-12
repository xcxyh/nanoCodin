import type { AgentStep, Message } from "../core/messageTypes.js";
import type { ContextCompressionConfig } from "../core/runtimeConfig.js";
import type { SessionMemory } from "../core/toolTypes.js";
import { buildSessionMemory } from "./sessionMemory.js";

interface CompressionResult {
  stepsForPrompt: AgentStep[];
  sessionMemory: SessionMemory | null;
  compressed: boolean;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
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

export class CompressionManager {
  constructor(private readonly config: ContextCompressionConfig) {}

  maybeCompress(messages: Message[], steps: AgentStep[], previousMemory: SessionMemory | null): CompressionResult {
    if (!this.config.enabled || steps.length < 4) {
      return { stepsForPrompt: steps, sessionMemory: previousMemory, compressed: false };
    }

    const textBlob = [
      messages.map((m) => m.content).join("\n"),
      steps.map((s) => `${s.thought}\n${s.observation ?? ""}`).join("\n")
    ].join("\n");
    const estimated = estimateTokens(textBlob);
    const threshold = Math.floor(this.config.contextTokenBudget * this.config.tokenThresholdRatio);

    if (estimated <= threshold) {
      return { stepsForPrompt: steps, sessionMemory: previousMemory, compressed: false };
    }

    const retainCount = Math.max(2, Math.floor(steps.length * this.config.retainRecentRatio));
    const oldSteps = steps.slice(0, Math.max(0, steps.length - retainCount));
    const recentSteps = steps.slice(steps.length - retainCount).map((step) => ({
      ...step,
      observation: step.observation ? compressCommandObservation(step.observation) : step.observation
    }));
    const sessionMemory = buildSessionMemory(messages, oldSteps, recentSteps);

    if (!sessionMemory.nextAction) {
      return { stepsForPrompt: steps, sessionMemory: previousMemory, compressed: false };
    }

    return { stepsForPrompt: recentSteps, sessionMemory, compressed: true };
  }
}
