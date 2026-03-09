import type { AgentStep, Message, ToolCall } from "../core/messageTypes.js";
import type { ToolContext } from "../core/toolTypes.js";
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

export function parseAgentResponse(text: string): ParsedAgentOutput {
  const thought = extractField(text, "Thought") ?? "No explicit thought provided.";
  const action = extractField(text, "Action") ?? "final";
  const inputRaw = extractField(text, "Action Input") ?? JSON.stringify({ answer: text });

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

export async function buildAgentMessages(messages: Message[], steps: AgentStep[], toolsDescription: string): Promise<Message[]> {
  return buildAgentMessagesWithContext(messages, steps, toolsDescription, "discover", null, []);
}

export async function buildAgentMessagesWithContext(
  messages: Message[],
  steps: AgentStep[],
  toolsDescription: string,
  phase: AgentPhase,
  workingMemory: string | null,
  agentsGuidelines: string[]
): Promise<Message[]> {
  const systemPrompt = await renderTemplate("system", {
    tools: toolsDescription,
    agentsGuidelines
  });
  const reactPrompt = await renderTemplate("react", {
    conversation: formatConversation(messages),
    trajectory: formatTrajectory(steps),
    phase,
    workingMemory: workingMemory ?? "(none)"
  });

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: reactPrompt }
  ];
}
