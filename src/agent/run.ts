import { randomUUID } from "node:crypto";
import { canonicalPath } from "../core/paths.js";
import { ModelRequestError, type ModelFailure, type Message, type ModelResponse } from "../core/messageTypes.js";
import { ToolExecutionError, type Tool, type ToolContext } from "../core/toolTypes.js";
import { ToolRegistry } from "../tools/registry.js";
import type { AgentEvent, ToolOutputEvent, RunStatus, Session } from "../session/types.js";
import { buildContext } from "./context.js";
import { finalToolSchema, parseTextAction } from "./protocol.js";

export interface Model {
  generate(messages: Message[], options?: { tools?: readonly Tool[]; abortSignal?: AbortSignal; nativeMessages?: readonly Message[] }): Promise<ModelResponse>;
}
export interface AgentOptions {
  model: Model;
  tools?: readonly Tool[];
  cwd?: string;
  instructions?: string | ((task: string, session: Session, context: { signal?: AbortSignal }) => string | Promise<string>);
  maxSteps?: number;
  maxHistoryChars?: number;
  session?: Session;
  ask?: ToolContext["ask"];
  save?: (session: Session, context: { signal?: AbortSignal }) => Promise<void>;
  /** Return a reason to continue working, or nothing to allow completion. */
  beforeFinish?: (session: Session, context: { signal?: AbortSignal }) => string | undefined | Promise<string | undefined>;
}
export interface RunOptions {
  signal?: AbortSignal;
  continuation?: boolean;
  onEvent?: (event: AgentEvent) => void;
  /** Live output only; does not call save() or alter the conversation. */
  onProgress?: (event: ToolOutputEvent) => void | Promise<void>;
}
export interface RunResult {
  status: RunStatus;
  answer: string;
  session: Session;
  persistenceError?: string;
  failure?: ModelFailure;
}

const DEFAULT_INSTRUCTIONS = "Complete the user's task using the available tools. Correct errors using tool results. Keep the final answer concise and in the user's language.";

export function createAgent(options: AgentOptions) {
  const tools = new ToolRegistry(options.tools);
  const maxSteps = options.maxSteps ?? 50;
  if (!Number.isInteger(maxSteps) || maxSteps < 1) throw new Error("maxSteps must be a positive integer.");
  if (options.maxHistoryChars !== undefined && (!Number.isInteger(options.maxHistoryChars) || options.maxHistoryChars < 1000)) {
    throw new Error("maxHistoryChars must be an integer >= 1000.");
  }
  if (options.session && options.cwd && canonicalPath(options.cwd) !== canonicalPath(options.session.cwd)) {
    throw new Error("cwd does not match the supplied session.");
  }
  let session: Session = options.session ? { ...structuredClone(options.session), cwd: canonicalPath(options.session.cwd) } : newSession(options.cwd ?? process.cwd());
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
        observe(run.onEvent, structuredClone(event));
        if (options.save) {
          try { await options.save(structuredClone(session), { signal: run.signal }); }
          catch (error) {
            if (!persistenceError) {
              persistenceError = errorMessage(error);
              const warning: AgentEvent = { at: Date.now(), type: "notice", kind: "persistence", text: `会话保存失败：${persistenceError}` };
              session.events.push(warning);
              observe(run.onEvent, structuredClone(warning));
            }
          }
        }
      };
      const finish = async (status: RunStatus, answer: string, failure?: ModelFailure): Promise<RunResult> => {
        await emit({ at: Date.now(), type: "finish", status, answer, ...(failure ? { failure } : {}) });
        return { status, answer, session: structuredClone(session), persistenceError, ...(failure ? { failure } : {}) };
      };
      try {
        await emit({ at: Date.now(), type: "user", text: task, continuation: run.continuation ?? false });
        const custom = typeof options.instructions === "function" ? await options.instructions(task, structuredClone(session), { signal: run.signal }) : options.instructions;
        run.signal?.throwIfAborted();
        const instructions = custom ?? DEFAULT_INSTRUCTIONS;
        for (let round = 0; round < maxSteps; round++) {
          run.signal?.throwIfAborted();
          const requestId = randomUUID();
          await emit({ at: Date.now(), type: "model_start", requestId, round: round + 1 });
          let response: ModelResponse;
          try {
            run.signal?.throwIfAborted();
            const context = buildContext(session, instructions, options.maxHistoryChars);
            response = await options.model.generate(context.messages, { tools: tools.list(), abortSignal: run.signal, nativeMessages: context.nativeMessages });
          } catch (error) {
            await emit({ at: Date.now(), type: "model_end", requestId, status: run.signal?.aborted || (error instanceof Error && error.name === "AbortError") || (error instanceof ModelRequestError && error.failure.kind === "cancelled") ? "cancelled" : "error", ...(error instanceof ModelRequestError ? { failure: error.failure } : {}) });
            throw error;
          }
          await emit({ at: Date.now(), type: "model_end", requestId, status: run.signal?.aborted ? "cancelled" : "complete", ...(response.request ? { request: response.request } : {}), ...(response.providerData ? { providerData: response.providerData } : {}) });
          run.signal?.throwIfAborted();
          if (response.usage) await emit({ at: Date.now(), type: "usage", usage: response.usage });
          if (response.finishReason === "content-filter") return await finish("incomplete", "模型内容过滤阻止了本次请求，任务尚未完成。");
          let calls = response.toolCalls?.length ? response.toolCalls : response.toolCall ? [response.toolCall] : [];
          try {
            if (response.error || response.finishReason === "error") throw new Error(response.error ?? "Model returned an error finish reason.");
            if (response.finishReason === "tool-calls" && !calls.length) throw new Error("Model reported tool calls but provided none.");
            if (response.finishReason === "length") throw new Error("Response truncated. Return a shorter valid action.");
            if (!calls.length) calls = [parseTextAction(response.text)];
          } catch (error) {
            await emit({ at: Date.now(), type: "notice", text: `ERROR: ${errorMessage(error)}` });
            continue;
          }
          if (calls.some((call, index) => call.id && calls.findIndex((other) => other.id === call.id) !== index)) {
            await emit({ at: Date.now(), type: "notice", text: "ERROR: Duplicate tool call IDs. No calls were executed." });
            continue;
          }
          if (calls.length > 1 && calls.some((call) => call.name === "final")) {
            await emit({ at: Date.now(), type: "notice", text: "ERROR: Send final alone after receiving all tool results. No calls in this mixed batch were executed." });
            continue;
          }
          for (const call of calls) {
            run.signal?.throwIfAborted();
            if (call.name === "final") {
              const parsed = finalToolSchema.safeParse(call.input);
              if (!parsed.success) {
                await emit({ at: Date.now(), type: "notice", text: "ERROR: final requires a non-empty answer string and optional boolean incomplete." });
                continue;
              }
              const input = parsed.data;
              const reason = input.incomplete === true ? undefined : await options.beforeFinish?.(structuredClone(session), { signal: run.signal });
              run.signal?.throwIfAborted();
              if (reason) {
                await emit({ at: Date.now(), type: "notice", text: `ERROR: ${reason} Continue, or use final with incomplete=true and explain the blocker.` });
                continue;
              }
              return await finish(input.incomplete === true ? "incomplete" : "complete", input.answer.trim());
            }
            const callId = randomUUID();
            await emit({ at: Date.now(), type: "tool_start", callId, call, mutates: tools.getToolByName(call.name)?.mutates ?? false });
            let result;
            let outputOpen = true;
            const onOutput: ToolContext["onOutput"] = (output) => {
              if (!outputOpen) return;
              observe(run.onProgress, { ...output, at: Date.now(), callId });
            };
            try {
              result = await tools.execute(call.name, call.input, { cwd: session.cwd, sessionId: session.id, signal: run.signal, ask: options.ask, onOutput });
            } catch (error) {
              outputOpen = false;
              // An interrupted write may have partial effects. Record the attempt; never replay it automatically.
              await emit({ at: Date.now(), type: "tool_end", callId, call, result: { ok: false, reason: run.signal?.aborted || (error instanceof Error && error.name === "AbortError") ? "cancelled" : undefined, output: errorMessage(error), effects: error instanceof ToolExecutionError ? { changed: false, uncertainChanges: error.uncertainChanges } : tools.getToolByName(call.name)?.mutates ? { uncertainChanges: true } : undefined } });
              throw error;
            }
            outputOpen = false;
            await emit({ at: Date.now(), type: "tool_end", callId, call, result });
            run.signal?.throwIfAborted();
          }
        }
        return await finish("incomplete", `已达到 ${maxSteps} 轮执行上限，任务尚未完成。可提高 --max-steps，或恢复会话继续。`);
      } catch (error) {
        return await finish(run.signal?.aborted || (error instanceof Error && error.name === "AbortError") || (error instanceof ModelRequestError && error.failure.kind === "cancelled") ? "cancelled" : "error", errorMessage(error).slice(0, 600), error instanceof ModelRequestError ? error.failure : undefined);
      } finally { running = false; }
    }
  };
}

export type Agent = ReturnType<typeof createAgent>;
function newSession(cwd: string): Session { return { version: 1, id: `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`, cwd: canonicalPath(cwd), createdAt: Date.now(), events: [] }; }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

function observe<T>(callback: ((event: T) => unknown) | undefined, event: T): void {
  try { void Promise.resolve(callback?.(event)).catch(() => {}); } catch { /* Observers never control execution. */ }
}
