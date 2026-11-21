import { randomUUID } from "node:crypto";
import { canonicalPath } from "./workspace.js";
import type { ModelFailure, RequestInfo, TokenUsage, ToolCall } from "./messages.js";
import type { ToolOutput, ToolResult } from "./tools.js";

export type RunStatus = "complete" | "incomplete" | "error" | "cancelled";
export type AgentEvent = { at: number } & (
  | { type: "user"; text: string; continuation: boolean }
  | { type: "model_start"; requestId: string; round: number }
  | { type: "model_end"; requestId: string; status: "complete" | "error" | "cancelled"; request?: RequestInfo; failure?: ModelFailure; providerData?: Record<string, unknown> }
  | { type: "usage"; usage: TokenUsage }
  | { type: "tool_start"; callId: string; call: ToolCall; mutates?: boolean }
  | { type: "tool_end"; callId: string; call: ToolCall; result: ToolResult }
  | { type: "notice"; text: string; kind?: "persistence" }
  | { type: "finish"; status: RunStatus; answer: string; failure?: ModelFailure }
);

/** Live display data; the final tool_end remains authoritative. */
export type ToolOutputEvent = ToolOutput & { at: number; callId: string };

/** The only persisted runtime state. UI, prompts and workflows derive their views from it. */
export interface Session {
  version: 1;
  id: string;
  cwd: string;
  createdAt: number;
  events: AgentEvent[];
}

export function newSession(cwd: string): Session { return { version: 1, id: `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`, cwd: canonicalPath(cwd), createdAt: Date.now(), events: [] }; }

export function observe<T>(callback: ((event: T) => unknown) | undefined, event: T): void {
  try { void Promise.resolve(callback?.(event)).catch(() => {}); } catch { /* Observers never control execution. */ }
}

/** A competing writer invalidates the run before it can execute further tools. */
export class SessionConflictError extends Error {
  constructor() { super("Session changed or is active in another writer. Reload it before continuing."); }
}

export type AppendEvent = (session: Session, event: AgentEvent) => Promise<void>;

export function recordRun(session: Session, onEvent: ((event: AgentEvent) => void) | undefined,
  save: ((session: Session, context: { signal?: AbortSignal }) => Promise<void>) | undefined, signal?: AbortSignal, append?: AppendEvent) {
  let persistenceError: string | undefined;
  let conflict = false;
  const emit = async (event: AgentEvent): Promise<void> => {
    session.events.push(event);
    // Observers receive copies and cannot mutate the runtime's source of truth.
    if (onEvent) observe(onEvent, structuredClone(event));
    if (save || append) {
      try {
        if (append && !conflict && (!persistenceError || event.type === "finish")) await append(session, event);
        if (save) await save(structuredClone(session), { signal });
      }
      catch (error) {
        if (!persistenceError) {
          persistenceError = error instanceof Error ? error.message : String(error);
          const warning: AgentEvent = { at: Date.now(), type: "notice", kind: "persistence", text: `会话保存失败：${persistenceError}` };
          session.events.push(warning);
          if (onEvent) observe(onEvent, structuredClone(warning));
        }
        if (append && error instanceof SessionConflictError) {
          conflict = true;
          throw error;
        }
      }
    }
  };
  return { emit, get persistenceError() { return persistenceError; } };
}
