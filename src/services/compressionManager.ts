import type { AgentStep, Message } from "../core/messageTypes.js";
import type { CompressionSnapshot, DurableMemory, WorkingMemory } from "../core/toolTypes.js";
import type { ContextCompressionConfig } from "../core/runtimeConfig.js";
import { buildCompressionSnapshot, buildPromptMemoryBlock } from "./memoryManager.js";

interface CompressionResult {
  stepsForPrompt: AgentStep[];
  compressionSnapshot: CompressionSnapshot | null;
  compressed: boolean;
  promptMemoryBlock: {
    workingMemory: string;
    compressedHistory: string;
    durableMemory: string;
  };
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function compactLine(text: string): string {
  return text.split("\n").map((line) => line.trim()).find(Boolean) ?? text.trim();
}

function summarizeObservation(step: AgentStep): string {
  const action = step.action;
  const path = action && typeof action.input === "object" && action.input !== null && "path" in action.input
    ? (action.input as { path?: unknown }).path
    : null;
  const command = action && typeof action.input === "object" && action.input !== null && "command" in action.input
    ? (action.input as { command?: unknown }).command
    : null;
  const firstLine = compactLine(step.observation ?? "");
  if (action?.name === "bash") {
    const commandText = typeof command === "string" ? command : "command";
    return `${commandText} => ${firstLine}`;
  }
  if (typeof path === "string" && path.trim()) {
    return `${action?.name ?? "action"} ${path} => ${firstLine}`;
  }
  return firstLine || step.thought;
}

function compressStep(step: AgentStep): AgentStep {
  if (!step.observation) {
    return step;
  }
  return {
    ...step,
    observation: summarizeObservation(step)
  };
}

export class CompressionManager {
  constructor(private readonly config: ContextCompressionConfig) {}

  maybeCompress(
    messages: Message[],
    steps: AgentStep[],
    workingMemory: WorkingMemory | null,
    durableMemory: DurableMemory
  ): CompressionResult {
    const initialPromptMemoryBlock = buildPromptMemoryBlock(workingMemory, null, durableMemory);
    if (!this.config.enabled || steps.length < 4) {
      return {
        stepsForPrompt: steps,
        compressionSnapshot: null,
        compressed: false,
        promptMemoryBlock: initialPromptMemoryBlock
      };
    }

    const textBlob = [
      messages.map((message) => message.content).join("\n"),
      steps.map((step) => `${step.thought}\n${step.observation ?? ""}`).join("\n")
    ].join("\n");
    const estimated = estimateTokens(textBlob);
    const threshold = Math.floor(this.config.contextTokenBudget * this.config.tokenThresholdRatio);

    if (estimated <= threshold) {
      return {
        stepsForPrompt: steps,
        compressionSnapshot: null,
        compressed: false,
        promptMemoryBlock: initialPromptMemoryBlock
      };
    }

    const retainCount = Math.max(2, Math.floor(steps.length * this.config.retainRecentRatio));
    const oldSteps = steps.slice(0, Math.max(0, steps.length - retainCount));
    const recentSteps = steps.slice(steps.length - retainCount).map((step) => compressStep(step));
    const compressionSnapshot = buildCompressionSnapshot(oldSteps, recentSteps, workingMemory);
    return {
      stepsForPrompt: recentSteps,
      compressionSnapshot,
      compressed: Boolean(compressionSnapshot),
      promptMemoryBlock: buildPromptMemoryBlock(workingMemory, compressionSnapshot, durableMemory)
    };
  }
}
