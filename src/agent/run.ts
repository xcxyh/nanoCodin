import { randomUUID } from "node:crypto";
import path from "node:path";
import type { Message, ModelResponse } from "../core/messageTypes.js";
import type { Tool, ToolContext } from "../core/toolTypes.js";
import { ToolRegistry } from "../tools/registry.js";
import type { AgentEvent, RunStatus, Session } from "../session/types.js";
import { buildMessages } from "./context.js";
import { parseTextAction } from "./protocol.js";

export interface Model {
  generate(messages: Message[], options?: { tools?: readonly Tool[]; abortSignal?: AbortSignal }): Promise<ModelResponse>;
}
export interface AgentOptions {
  model: Model;
  tools?: readonly Tool[];
  cwd?: string;
  instructions?: string | ((task: string, session: Session) => string | Promise<string>);
  maxSteps?: number;
  maxHistoryChars?: number;
  session?: Session;
  ask?: ToolContext["ask"];
  save?: (session: Session) => Promise<void>;
  /** Return a reason to continue working, or nothing to allow completion. */
  beforeFinish?: (session: Session) => string | undefined | Promise<string | undefined>;
}
export interface RunOptions {
  signal?: AbortSignal;
  continuation?: boolean;
  onEvent?: (event: AgentEvent) => void;
}
export interface RunResult {
  status: RunStatus;
  answer: string;
  session: Session;
  persistenceError?: string;
}

const DEFAULT_INSTRUCTIONS = "Complete the user's task using the available tools. Correct errors using tool results. Keep the final answer concise and in the user's language.";

export function createAgent(options: AgentOptions) {
  const tools = new ToolRegistry(options.tools);
  const maxSteps = options.maxSteps ?? 50;
  if (!Number.isInteger(maxSteps) || maxSteps < 1) throw new Error("maxSteps must be a positive integer.");
  if (options.maxHistoryChars !== undefined && (!Number.isInteger(options.maxHistoryChars) || options.maxHistoryChars < 1000)) {
    throw new Error("maxHistoryChars must be an integer >= 1000.");
  }
  if (options.session && options.cwd && path.resolve(options.cwd) !== path.resolve(options.session.cwd)) {
    throw new Error("cwd does not match the supplied session.");
  }
  let session: Session = options.session ? structuredClone(options.session) : newSession(options.cwd ?? process.cwd());
  let running = false;
  return {
    get session(): Session { return structuredClone(session); },
    reset(): void {
      if (running) throw new Error("Cannot reset a running agent.");
      session = newSession(session.cwd);
    },
    async run(task: string, run: RunOptions = {}): Promise<RunResult> {
      if (running) throw new Error("An agent run is already active.");
      if (!task.trim()) throw new Error("Task must not be empty.");
      running = true;
      let persistenceError: string | undefined;
      const emit = async (event: AgentEvent): Promise<void> => {
        session.events.push(event);
        // Observers receive copies and cannot mutate the runtime's source of truth.
        try { run.onEvent?.(structuredClone(event)); } catch { /* Observer failures do not interrupt tools. */ }
        if (options.save) {
          try { await options.save(structuredClone(session)); }
          catch (error) {
            if (!persistenceError) {
              persistenceError = errorMessage(error);
              const warning: AgentEvent = { at: Date.now(), type: "notice", kind: "persistence", text: `会话保存失败：${persistenceError}` };
              session.events.push(warning);
              try { run.onEvent?.(structuredClone(warning)); } catch { /* Same observer contract. */ }
            }
          }
        }
      };
      const finish = async (status: RunStatus, answer: string): Promise<RunResult> => {
        await emit({ at: Date.now(), type: "finish", status, answer });
        return { status, answer, session: structuredClone(session), persistenceError };
      };
      try {
        await emit({ at: Date.now(), type: "user", text: task, continuation: run.continuation ?? false });
        const custom = typeof options.instructions === "function" ? await options.instructions(task, structuredClone(session)) : options.instructions;
        const instructions = custom ?? DEFAULT_INSTRUCTIONS;
        for (let round = 0; round < maxSteps; round++) {
          run.signal?.throwIfAborted();
          const response = await options.model.generate(buildMessages(session, instructions, options.maxHistoryChars), { tools: tools.list(), abortSignal: run.signal });
          run.signal?.throwIfAborted();
          if (response.usage) await emit({ at: Date.now(), type: "usage", usage: response.usage });
          let calls = response.toolCalls?.length ? response.toolCalls : response.toolCall ? [response.toolCall] : [];
          try {
            if (response.error) throw new Error(response.error);
            if (response.finishReason === "length") throw new Error("Response truncated. Return a shorter valid action.");
            if (!calls.length) calls = [parseTextAction(response.text)];
          } catch (error) {
            await emit({ at: Date.now(), type: "notice", text: `ERROR: ${errorMessage(error)}` });
            continue;
          }
          if (calls.length > 1 && calls.some((call) => call.name === "final")) {
            await emit({ at: Date.now(), type: "notice", text: "ERROR: Send final alone after receiving all tool results. No calls in this mixed batch were executed." });
            continue;
          }
          for (const call of calls) {
            run.signal?.throwIfAborted();
            if (call.name === "final") {
              const input = call.input as { answer?: unknown; incomplete?: unknown } | null;
              if (typeof input?.answer !== "string" || !input.answer.trim()) {
                await emit({ at: Date.now(), type: "notice", text: "ERROR: final requires a non-empty answer string." });
                continue;
              }
              const reason = input.incomplete === true ? undefined : await options.beforeFinish?.(structuredClone(session));
              if (reason) {
                await emit({ at: Date.now(), type: "notice", text: `ERROR: ${reason} Continue, or use final with incomplete=true and explain the blocker.` });
                continue;
              }
              return await finish(input.incomplete === true ? "incomplete" : "complete", input.answer.trim());
            }
            const callId = randomUUID();
            await emit({ at: Date.now(), type: "tool_start", callId, call, mutates: tools.getToolByName(call.name)?.mutates ?? false });
            let result;
            try {
              result = await tools.execute(call.name, call.input, { cwd: session.cwd, sessionId: session.id, signal: run.signal, ask: options.ask });
            } catch (error) {
              // An interrupted write may have partial effects. Record the attempt; never replay it automatically.
              await emit({ at: Date.now(), type: "tool_end", callId, call, result: { ok: false, output: errorMessage(error), effects: tools.getToolByName(call.name)?.mutates ? { changed: true } : undefined } });
              throw error;
            }
            await emit({ at: Date.now(), type: "tool_end", callId, call, result });
            run.signal?.throwIfAborted();
          }
        }
        return await finish("incomplete", `已达到 ${maxSteps} 轮执行上限，任务尚未完成。可提高 --max-steps，或恢复会话继续。`);
      } catch (error) {
        return await finish(run.signal?.aborted || (error instanceof Error && error.name === "AbortError") ? "cancelled" : "error", errorMessage(error).slice(0, 600));
      } finally { running = false; }
    }
  };
}

export type Agent = ReturnType<typeof createAgent>;
function newSession(cwd: string): Session { return { version: 1, id: `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`, cwd: path.resolve(cwd), createdAt: Date.now(), events: [] }; }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
