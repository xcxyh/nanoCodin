import { randomUUID } from "node:crypto";
import type { ToolCall } from "./messages.js";
import { observe, type AgentEvent, type ToolOutputEvent } from "./session.js";
import type { z } from "zod";
import type { AskUserQuestionRequest } from "./question.js";

export interface PlanItem {
  text: string;
  status: "pending" | "in_progress" | "completed";
}

export interface CommandEvidence {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  verification: boolean;
}

export interface ToolOutput {
  stream: "stdout" | "stderr";
  /** Bounded tail snapshot for this stream, not an append-only delta. */
  text: string;
}

export class ToolExecutionError extends Error {
  constructor(readonly code: string, message: string, readonly uncertainChanges = false) { super(message); this.name = "ToolExecutionError"; }
}

export interface ToolResult {
  ok: boolean;
  code?: string;
  data?: Record<string, unknown>;
  reason?: "denied" | "cancelled" | "timeout";
  output: string;
  /** Facts consumed by optional workflows, never hidden agent state. */
  effects?: {
    changedFiles?: string[];
    changed?: boolean;
    uncertainChanges?: boolean;
    command?: CommandEvidence;
    plan?: PlanItem[];
    verificationCommands?: string[];
  };
}

export interface ToolContext {
  cwd: string;
  sessionId?: string;
  signal?: AbortSignal;
  /** Optional live display; snapshots are never persisted as session events. */
  onOutput?: (output: ToolOutput) => void | Promise<void>;
  ask?: <T extends string>(request: AskUserQuestionRequest<T>, signal?: AbortSignal) => Promise<T>;
}

export interface Tool<TInput = any> {
  name: string;
  description: string;
  schema: z.ZodType<TInput>;
  /** Thrown or interrupted execution may leave changes; default false. */
  mutates?: boolean;
  execute(input: TInput, context: ToolContext): Promise<ToolResult>;
}

/** Infer tool input from its schema while keeping the registration contract explicit. */
export function defineTool<T>(definition: Tool<T>): Tool<T> { return definition; }

/** Registration + validation only. No filesystem, model, UI or permission policy. */
export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  constructor(tools: readonly Tool[] = []) {
    for (const tool of tools) this.register(tool);
  }

  register(tool: Tool): void {
    if (!/^[a-zA-Z_][\w-]*$/.test(tool.name) || tool.name === "final") throw new Error(`Invalid or reserved tool name: ${tool.name}`);
    if (this.tools.has(tool.name)) throw new Error(`Duplicate tool: ${tool.name}`);
    this.tools.set(tool.name, tool);
  }

  list(): Tool[] { return [...this.tools.values()]; }
  getToolByName(name: string): Tool | undefined { return this.tools.get(name); }

  async execute(name: string, input: unknown, context: ToolContext): Promise<ToolResult> {
    if (context.signal?.aborted) throw new ToolExecutionError("CANCELLED", "Tool cancelled before execution.");
    const tool = this.tools.get(name);
    if (!tool) return { ok: false, code: "UNKNOWN_TOOL", output: `Unknown tool: ${name}. Available tools: ${this.list().map((item) => item.name).join(", ")}.` };
    const parsed = tool.schema.safeParse(input);
    if (!parsed.success) return { ok: false, code: "INVALID_INPUT", output: `Invalid input for ${name}: ${parsed.error.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`).join("; ")}. Use its exact schema.` };
    try {
      return await tool.execute(parsed.data, context);
    } catch (error) {
      if (context.signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
      return { ok: false, code: error instanceof ToolExecutionError ? error.code : "TOOL_ERROR", output: error instanceof Error ? error.message : String(error), effects: error instanceof ToolExecutionError ? { changed: false, uncertainChanges: error.uncertainChanges } : tool.mutates ? { uncertainChanges: true } : undefined };
    }
  }
}

export async function executeCall(tools: ToolRegistry, call: ToolCall, context: ToolContext,
  emit: (event: AgentEvent) => Promise<void>, onProgress?: (event: ToolOutputEvent) => unknown) {
  const callId = randomUUID();
  await emit({ at: Date.now(), type: "tool_start", callId, call, mutates: tools.getToolByName(call.name)?.mutates ?? false });
  let result;
  let outputOpen = true;
  const onOutput: ToolContext["onOutput"] = (output) => {
    if (!outputOpen) return;
    observe(onProgress, { ...output, at: Date.now(), callId });
  };
  try {
    result = await tools.execute(call.name, call.input, { ...context, onOutput });
  } catch (error) {
    outputOpen = false;
    // An interrupted write may have partial effects. Record the attempt; never replay it automatically.
    const cancelled = context.signal?.aborted || (error instanceof Error && error.name === "AbortError");
    const effects = error instanceof ToolExecutionError
      ? { changed: false, uncertainChanges: error.uncertainChanges }
      : tools.getToolByName(call.name)?.mutates ? { uncertainChanges: true } : undefined;
    await emit({
      at: Date.now(), type: "tool_end", callId, call,
      result: { ok: false, reason: cancelled ? "cancelled" : undefined, output: error instanceof Error ? error.message : String(error), effects }
    });
    throw error;
  }
  outputOpen = false;
  await emit({ at: Date.now(), type: "tool_end", callId, call, result });
}
