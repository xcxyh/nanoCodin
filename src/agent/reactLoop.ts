import type { AgentStep, Message, TokenUsage, ToolCall } from "../core/messageTypes.js";
import type { CompressionSnapshot, ContextSources, TodoItem, TodoState, ToolContext, WorkingMemory } from "../core/toolTypes.js";
import type { ModelProvider } from "../llm/modelRouter.js";
import { renderTemplate } from "../prompts/templateEngine.js";
import type { ToolRegistry } from "../tools/registry.js";
import { MAX_TODO_ITEMS } from "../tools/planning/todoLimits.js";
import { buildPromptMemoryBlock } from "../services/memoryManager.js";

export interface ParsedAgentOutput {
  thought: string;
  action: string;
  actionInput: Record<string, unknown>;
}

export interface ReActRuntime {
  model: ModelProvider;
  tools: ToolRegistry;
  toolContext: ToolContext;
  maxSteps: number;
}

export type AgentPhase = "discover" | "plan" | "execute" | "verify" | "finalize";

export type AgentEvent =
  | { type: "thought"; thought: string }
  | { type: "action"; action: ToolCall }
  | { type: "observation"; observation: string }
  | { type: "final"; answer: string }
  | { type: "error"; error: string }
  | { type: "state"; snapshot: AgentExecutionSnapshot };

export interface AgentExecutionSnapshot {
  phase: AgentPhase;
  todos: TodoItem[];
  todoCounts: {
    pending: number;
    inProgress: number;
    completed: number;
    total: number;
  };
  todoProgressText: string;
  activeTodoId: string | null;
  verificationGoal: string;
  verificationCommands: string[];
  verificationStatus: string;
  latestVerification: string | null;
  tokenUsage: TokenUsage | null;
  subtaskSummaries: string[];
  sessionNextAction: string | null;
  touchedFiles: string[];
}

function extractField(text: string, field: string): string | null {
  const match = text.match(new RegExp(`^${field}:\\s*(.*)$`, "im"));
  return match ? match[1].trim() : null;
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&quot;/g, "\"")
    .replace(/&#34;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function splitActionAndInlineInput(actionRaw: string): { action: string; inlineInput: string | null } {
  const normalized = decodeHtmlEntities(actionRaw).replace(/^`+|`+$/g, "").trim();
  const jsonStart = normalized.search(/\s+\{/);
  if (jsonStart === -1) {
    return { action: normalized, inlineInput: null };
  }
  const action = normalized.slice(0, jsonStart).trim();
  const inlineInput = normalized.slice(jsonStart).trim();
  return { action, inlineInput: inlineInput.startsWith("{") ? inlineInput : null };
}

export function parseAgentResponse(text: string): ParsedAgentOutput {
  const thought = extractField(text, "Thought") ?? "No explicit thought provided.";
  const actionRaw = extractField(text, "Action") ?? "final";
  const { action, inlineInput } = splitActionAndInlineInput(actionRaw);
  const explicitInput = extractField(text, "Action Input");
  const inputRaw = decodeHtmlEntities(explicitInput ?? inlineInput ?? JSON.stringify({ answer: text }));

  let actionInput: Record<string, unknown>;
  try {
    actionInput = JSON.parse(inputRaw) as Record<string, unknown>;
  } catch {
    if (action.toLowerCase() === "final") {
      actionInput = { answer: inputRaw };
    } else {
      actionInput = {};
    }
  }

  return { thought, action, actionInput };
}

function formatConversation(messages: Message[]): string {
  if (messages.length === 0) {
    return "(empty)";
  }
  return messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n");
}

function formatTrajectory(steps: AgentStep[]): string {
  if (steps.length === 0) {
    return "(none)";
  }

  return steps
    .map((step, index) => {
      const action = step.action ? `${step.action.name} ${JSON.stringify(step.action.input)}` : "(none)";
      const observation = step.observation ?? "(none)";
      return `Step ${index + 1}\nThought: ${step.thought}\nAction: ${action}\nObservation: ${observation}`;
    })
    .join("\n\n");
}

function formatSourceText(value: string | null): string {
  return value && value.trim().length > 0 ? value : "(none)";
}

function formatProjectRules(rules: string[]): string {
  if (rules.length === 0) {
    return "(none)";
  }
  return rules.map((rule) => `- ${rule}`).join("\n");
}

function formatExecutionState(
  todoState: TodoState,
  latestVerification: string | null
): string {
  const todos = todoState.items.length > 0
    ? todoState.items.map((item) => {
      const marker = item.status === "completed" ? "x" : item.status === "in_progress" ? "~" : " ";
      return `- [${marker}] ${item.content}`;
    }).join("\n")
    : "(none)";
  const subtasks = todoState.taskBundle.results.length > 0
    ? todoState.taskBundle.results.map((result) => `- ${result.status} ${result.task}: ${result.summary}`).join("\n")
    : "(none)";
  return [
    "Todo state:",
    todos,
    `Verification goal: ${todoState.verification.goal || "(none)"}`,
    `Verification commands: ${todoState.verification.commands.join(" | ") || "(none)"}`,
    `Verification status: ${todoState.verification.status}`,
    `Latest verification: ${latestVerification ?? todoState.verification.latestSummary ?? "(none)"}`,
    "Subtasks:",
    subtasks
  ].join("\n");
}

function buildTodoCounts(items: TodoItem[]) {
  const counts = {
    pending: 0,
    inProgress: 0,
    completed: 0,
    total: items.length
  };

  for (const item of items) {
    if (item.status === "completed") {
      counts.completed += 1;
    } else if (item.status === "in_progress") {
      counts.inProgress += 1;
    } else {
      counts.pending += 1;
    }
  }

  return counts;
}

function formatTodoProgressText(completed: number, total: number): string {
  if (total === 0) {
    return "已完成 0/0 (0%)";
  }
  return `已完成 ${completed}/${total} (${Math.round((completed / total) * 100)}%)`;
}

export async function buildAgentMessages(messages: Message[], steps: AgentStep[], toolsDescription: string): Promise<Message[]> {
  return buildAgentMessagesWithContext(messages, steps, toolsDescription, "discover", null, null, {
    projectRules: [],
    projectContext: null,
    durableMemory: {
      entries: [],
      legacyText: null
    },
    availableSkills: null
  }, "(none)", "(none)");
}

export async function buildAgentMessagesWithContext(
  messages: Message[],
  steps: AgentStep[],
  toolsDescription: string,
  phase: AgentPhase,
  workingMemory: WorkingMemory | null,
  compressionSnapshot: CompressionSnapshot | null,
  contextSources: ContextSources,
  executionState: string,
  toolHelp: string
): Promise<Message[]> {
  const promptMemoryBlock = buildPromptMemoryBlock(
    workingMemory,
    compressionSnapshot,
    contextSources.durableMemory
  );
  const systemPrompt = await renderTemplate("system", {
    tools: toolsDescription,
    projectRules: formatProjectRules(contextSources.projectRules),
    projectContext: formatSourceText(contextSources.projectContext),
    durableMemory: promptMemoryBlock.durableMemory,
    availableSkills: formatSourceText(contextSources.availableSkills),
    toolHelp,
    maxTodoItems: MAX_TODO_ITEMS
  });
  const reactPrompt = await renderTemplate("react", {
    conversation: formatConversation(messages),
    trajectory: formatTrajectory(steps),
    phase,
    workingMemory: promptMemoryBlock.workingMemory,
    compressedHistory: promptMemoryBlock.compressedHistory,
    executionState
  });

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: reactPrompt }
  ];
}

export function buildAgentExecutionSnapshot(
  phase: AgentPhase,
  todos: TodoState,
  workingMemory: WorkingMemory | null,
  latestVerification: string | null,
  tokenUsage: TokenUsage | null
): AgentExecutionSnapshot {
  const todoCounts = buildTodoCounts(todos.items);
  const activeTodo = todos.items.find((item) => item.status === "in_progress") ?? null;

  return {
    phase,
    todos: todos.items.map((item) => ({
      id: item.id,
      content: item.content,
      status: item.status
    })),
    todoCounts,
    todoProgressText: formatTodoProgressText(todoCounts.completed, todoCounts.total),
    activeTodoId: activeTodo?.id ?? null,
    verificationGoal: todos.verification.goal,
    verificationCommands: [...todos.verification.commands],
    verificationStatus: todos.verification.status,
    latestVerification,
    tokenUsage,
    subtaskSummaries: todos.taskBundle.results.map((result) => `${result.status} ${result.task}: ${result.summary}`),
    sessionNextAction: workingMemory?.nextAction ?? null,
    touchedFiles: workingMemory?.touchedFiles ?? []
  };
}

export function formatExecutionStateForPrompt(
  todoState: TodoState,
  latestVerification: string | null
): string {
  return formatExecutionState(todoState, latestVerification);
}
