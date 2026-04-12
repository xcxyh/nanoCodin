import type { AgentStep, Message, ToolCall } from "../core/messageTypes.js";
import type {
  CompressionSnapshot,
  DurableMemory,
  DurableMemoryEntry,
  DurableMemoryKind,
  TodoState,
  WorkingMemory
} from "../core/toolTypes.js";

function compactLine(text: string): string {
  return text.split("\n").map((line) => line.trim()).find(Boolean) ?? text.trim();
}

function pushLimited(items: string[], value: string, limit: number): string[] {
  const normalized = value.trim();
  if (!normalized) {
    return items;
  }
  if (items.includes(normalized)) {
    return items;
  }
  return [...items, normalized].slice(-limit);
}

function extractPath(action: ToolCall | undefined): string | null {
  const input = action?.input;
  if (!input || typeof input !== "object" || Array.isArray(input) || !("path" in input)) {
    return null;
  }
  const value = (input as { path?: unknown }).path;
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function extractCommand(action: ToolCall | undefined): string | null {
  const input = action?.input;
  if (!input || typeof input !== "object" || Array.isArray(input) || !("command" in input)) {
    return null;
  }
  const value = (input as { command?: unknown }).command;
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function inferGoal(messages: Message[]): string {
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user" && message.content.trim().length > 0);
  if (latestUserMessage) {
    return latestUserMessage.content.trim();
  }
  const latestNonToolMessage = [...messages].reverse().find((message) => message.role !== "tool" && message.content.trim().length > 0);
  return latestNonToolMessage?.content.trim() || "Complete the current coding task.";
}

export function createWorkingMemory(messages: Message[]): WorkingMemory {
  return {
    goal: inferGoal(messages),
    activePlan: [],
    touchedFiles: [],
    openQuestions: [],
    verification: [],
    recentFailures: [],
    nextAction: "Continue with the highest-priority open issue."
  };
}

function derivePlanFromTodos(todos: TodoState): string[] {
  return todos.items.map((item) => {
    const prefix = item.status === "completed" ? "done" : item.status === "in_progress" ? "doing" : "todo";
    return `${prefix}: ${item.content}`;
  }).slice(-8);
}

function deriveOpenQuestions(todos: TodoState): string[] {
  const questions = todos.items
    .filter((item) => item.status !== "completed")
    .map((item) => item.content);
  if (todos.verification.status !== "passed" && todos.verification.goal) {
    questions.push(`Verify: ${todos.verification.goal}`);
  }
  return questions.slice(-6);
}

function deriveVerification(todos: TodoState): string[] {
  const items = todos.verification.commands.map((command) => `${todos.verification.goal || "Verify"} -> ${command}`);
  if (todos.verification.latestSummary) {
    items.push(todos.verification.latestSummary);
  }
  return items.slice(-6);
}

export function applyToolResult(
  action: ToolCall,
  observation: string,
  currentWorkingMemory: WorkingMemory | null,
  todos: TodoState,
  messages: Message[]
): WorkingMemory {
  const next = currentWorkingMemory ? {
    ...currentWorkingMemory,
    activePlan: [...currentWorkingMemory.activePlan],
    touchedFiles: [...currentWorkingMemory.touchedFiles],
    openQuestions: [...currentWorkingMemory.openQuestions],
    verification: [...currentWorkingMemory.verification],
    recentFailures: [...currentWorkingMemory.recentFailures]
  } : createWorkingMemory(messages);

  next.goal = inferGoal(messages);
  next.activePlan = derivePlanFromTodos(todos);
  next.openQuestions = deriveOpenQuestions(todos);
  next.verification = deriveVerification(todos);

  const path = extractPath(action);
  if (path) {
    next.touchedFiles = pushLimited(next.touchedFiles, path, 20);
  }

  const shortObservation = compactLine(observation);
  if (/error|failed|exception/i.test(observation)) {
    next.recentFailures = pushLimited(next.recentFailures, shortObservation, 8);
  }

  const command = extractCommand(action);
  if (command && /\b(test|lint|typecheck|build)\b/i.test(command)) {
    next.verification = pushLimited(next.verification, `${command}: ${shortObservation}`, 6);
  }

  if (action.name === "summarize_changes") {
    next.nextAction = "Return a concise final answer with verification and residual risks.";
  } else if (todos.items.some((item) => item.status !== "completed")) {
    const active = todos.items.find((item) => item.status === "in_progress") ?? todos.items.find((item) => item.status === "pending");
    next.nextAction = active ? active.content : "Continue with the latest planned task.";
  } else if (todos.verification.status !== "passed" && todos.verification.goal) {
    next.nextAction = `Run verification for: ${todos.verification.goal}`;
  } else {
    next.nextAction = "Continue based on the latest tool observation.";
  }

  return next;
}

function summarizeOldStep(step: AgentStep): string | null {
  const actionName = step.action?.name ?? "";
  const observation = compactLine(step.observation ?? "");
  const path = extractPath(step.action);
  if (actionName === "bash") {
    const command = extractCommand(step.action) ?? "command";
    return `${command} => ${observation}`;
  }
  if (path) {
    return `${actionName || "action"} ${path} => ${observation}`;
  }
  if (observation) {
    return observation;
  }
  return step.thought.trim() || null;
}

export function buildCompressionSnapshot(
  oldSteps: AgentStep[],
  recentSteps: AgentStep[],
  workingMemory: WorkingMemory | null
): CompressionSnapshot | null {
  if (oldSteps.length === 0) {
    return null;
  }

  const decisions = oldSteps
    .map((step) => step.thought.trim())
    .filter(Boolean)
    .slice(0, 8);
  const completedWork = oldSteps
    .map((step) => summarizeOldStep(step))
    .filter((value): value is string => Boolean(value))
    .slice(-8);
  const pendingWork = [
    ...(workingMemory?.openQuestions ?? []),
    workingMemory?.nextAction ?? ""
  ].filter(Boolean).slice(0, 6);
  const importantEvidence = [...oldSteps, ...recentSteps]
    .map((step) => compactLine(step.observation ?? ""))
    .filter((line) => /error|failed|exception|passed|ok:/i.test(line))
    .slice(-8);
  const start = 1;
  const end = oldSteps.length;

  return {
    summary: completedWork[completedWork.length - 1] ?? decisions[decisions.length - 1] ?? "Earlier work summarized.",
    decisions,
    completedWork,
    pendingWork,
    importantEvidence,
    sourceStepRange: { start, end }
  };
}

function formatList(items: string[]): string {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- (none)";
}

function formatDurableMemorySummary(memory: DurableMemory): string {
  const lines = memory.entries
    .slice(-8)
    .map((entry) => `${entry.kind}: ${entry.content}${entry.tags.length > 0 ? ` [${entry.tags.join(", ")}]` : ""}`);
  if (memory.legacyText) {
    lines.push(`legacy: ${compactLine(memory.legacyText)}`);
  }
  return lines.length > 0 ? lines.map((line) => `- ${line}`).join("\n") : "- (none)";
}

export function buildPromptMemoryBlock(
  workingMemory: WorkingMemory | null,
  compressionSnapshot: CompressionSnapshot | null,
  durableMemory: DurableMemory
): {
  workingMemory: string;
  compressedHistory: string;
  durableMemory: string;
} {
  const working = workingMemory
    ? [
      `Goal: ${workingMemory.goal}`,
      "Active plan:",
      formatList(workingMemory.activePlan),
      "Touched files:",
      formatList(workingMemory.touchedFiles),
      "Open questions:",
      formatList(workingMemory.openQuestions),
      "Verification:",
      formatList(workingMemory.verification),
      "Recent failures:",
      formatList(workingMemory.recentFailures),
      `Next action: ${workingMemory.nextAction}`
    ].join("\n")
    : "(none)";

  const compressed = compressionSnapshot
    ? [
      `Summary: ${compressionSnapshot.summary}`,
      `Source range: steps ${compressionSnapshot.sourceStepRange.start}-${compressionSnapshot.sourceStepRange.end}`,
      "Decisions:",
      formatList(compressionSnapshot.decisions),
      "Completed work:",
      formatList(compressionSnapshot.completedWork),
      "Pending work:",
      formatList(compressionSnapshot.pendingWork),
      "Important evidence:",
      formatList(compressionSnapshot.importantEvidence)
    ].join("\n")
    : "(none)";

  return {
    workingMemory: working,
    compressedHistory: compressed,
    durableMemory: formatDurableMemorySummary(durableMemory)
  };
}

export function buildLegacyWorkingMemory(
  input: {
    goal?: unknown;
    decisions?: unknown;
    touchedFiles?: unknown;
    pendingVerification?: unknown;
    failureNotes?: unknown;
    nextAction?: unknown;
  } | null | undefined
): WorkingMemory | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  return {
    goal: typeof input.goal === "string" ? input.goal : "Complete the current coding task.",
    activePlan: Array.isArray(input.decisions) ? input.decisions.filter((item): item is string => typeof item === "string").slice(0, 8) : [],
    touchedFiles: Array.isArray(input.touchedFiles) ? input.touchedFiles.filter((item): item is string => typeof item === "string").slice(0, 20) : [],
    openQuestions: Array.isArray(input.pendingVerification) ? input.pendingVerification.filter((item): item is string => typeof item === "string").slice(0, 6) : [],
    verification: Array.isArray(input.pendingVerification) ? input.pendingVerification.filter((item): item is string => typeof item === "string").slice(0, 6) : [],
    recentFailures: Array.isArray(input.failureNotes) ? input.failureNotes.filter((item): item is string => typeof item === "string").slice(0, 8) : [],
    nextAction: typeof input.nextAction === "string" ? input.nextAction : "Continue with the highest-priority open issue."
  };
}

export function createDurableMemoryEntry(kind: DurableMemoryKind, content: string, tags: string[] = []): DurableMemoryEntry {
  const now = Date.now();
  return {
    id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    content,
    tags,
    createdAt: now,
    updatedAt: now
  };
}
