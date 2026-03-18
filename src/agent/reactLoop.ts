import type { AgentStep, Message, ToolCall } from "../core/messageTypes.js";
import type { ContextSources, SessionMemory, ToolContext } from "../core/toolTypes.js";
import type { ModelProvider } from "../llm/modelRouter.js";
import { renderTemplate } from "../prompts/templateEngine.js";
import type { ToolRegistry } from "../tools/registry.js";

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
  | { type: "error"; error: string };

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

function formatSessionMemory(memory: SessionMemory | null): string {
  if (!memory) {
    return "(none)";
  }
  return JSON.stringify(memory, null, 2);
}

function buildToolHelp(phase: AgentPhase): string {
  const lines = [
    "Prefer repo_index_query, read_context, ls, tree, grep, and view for discovery.",
    "Use todo to create a 1-3 item plan and set verificationPlan before edits.",
    "Use delegate for bounded research subtasks when the answer can be summarized for the main task.",
    "Use summarize_changes before final when edits or validation happened."
  ];
  if (phase === "verify") {
    lines.unshift("In verify, run a validation command and capture the result before final.");
  }
  if (phase === "plan") {
    lines.unshift("In plan, define both execution steps and how you will verify the result.");
  }
  return lines.map((line) => `- ${line}`).join("\n");
}

export async function buildAgentMessages(messages: Message[], steps: AgentStep[], toolsDescription: string): Promise<Message[]> {
  return buildAgentMessagesWithContext(messages, steps, toolsDescription, "discover", null, {
    projectRules: [],
    projectContext: null,
    persistentMemory: null
  });
}

export async function buildAgentMessagesWithContext(
  messages: Message[],
  steps: AgentStep[],
  toolsDescription: string,
  phase: AgentPhase,
  sessionMemory: SessionMemory | null,
  contextSources: ContextSources
): Promise<Message[]> {
  const systemPrompt = await renderTemplate("system", {
    tools: toolsDescription,
    projectRules: formatProjectRules(contextSources.projectRules),
    projectContext: formatSourceText(contextSources.projectContext),
    persistentMemory: formatSourceText(contextSources.persistentMemory),
    toolHelp: buildToolHelp(phase)
  });
  const reactPrompt = await renderTemplate("react", {
    conversation: formatConversation(messages),
    trajectory: formatTrajectory(steps),
    phase,
    sessionMemory: formatSessionMemory(sessionMemory)
  });

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: reactPrompt }
  ];
}
