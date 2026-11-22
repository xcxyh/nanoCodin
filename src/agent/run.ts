import { canonicalPath } from "./workspace.js";
import { ModelRequestError, type ModelFailure } from "./messages.js";
import { ToolRegistry, executeCall, type Tool, type ToolContext } from "./tools.js";
import { newSession, recordRun, type AppendEvent, type AgentEvent, type ToolOutputEvent, type RunStatus, type Session } from "./session.js";
import { buildContext, type HistoryHints } from "./history.js";
import { requestAction, wasCancelled, type Model } from "./model.js";
export type { Model } from "./model.js";

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

export interface RuntimeAdapters {
  append?: AppendEvent;
  budgetSummary?: (session: Session) => string;
  historyHints?: (session: Session) => HistoryHints;
}

export function createAgentRuntime(options: AgentOptions, adapters: RuntimeAdapters = {}) {
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
      const record = recordRun(session, run.onEvent, options.save, run.signal, adapters.append);
      const { emit } = record;
      const finish = async (status: RunStatus, answer: string, failure?: ModelFailure): Promise<RunResult> => {
        await emit({ at: Date.now(), type: "finish", status, answer, ...(failure ? { failure } : {}) });
        return { status, answer, session: structuredClone(session), persistenceError: record.persistenceError, ...(failure ? { failure } : {}) };
      };
      try {
        await emit({ at: Date.now(), type: "user", text: task, continuation: run.continuation ?? false });
        const custom = typeof options.instructions === "function" ? await options.instructions(task, structuredClone(session), { signal: run.signal }) : options.instructions;
        run.signal?.throwIfAborted();
        const instructions = custom ?? DEFAULT_INSTRUCTIONS;
        const history = () => buildContext(session, instructions, options.maxHistoryChars, adapters.historyHints?.(session));
        for (let round = 1; round <= maxSteps; round++) {
          run.signal?.throwIfAborted();
          const action = await requestAction(options.model, history, { tools: tools.list(), abortSignal: run.signal }, round, emit);
          if (action.type === "invalid") {
            await emit({ at: Date.now(), type: "notice", text: `ERROR: ${action.reason}` });
            continue;
          }
          if (action.type === "final") {
            const reason = action.incomplete ? undefined : await options.beforeFinish?.(structuredClone(session), { signal: run.signal });
            run.signal?.throwIfAborted();
            if (reason) {
              await emit({ at: Date.now(), type: "notice", text: `ERROR: ${reason} Continue, or use final with incomplete=true and explain the blocker.` });
              continue;
            }
            return await finish(action.incomplete ? "incomplete" : "complete", action.answer);
          }
          for (const call of action.calls) {
            run.signal?.throwIfAborted();
            await executeCall(tools, call, { cwd: session.cwd, sessionId: session.id, signal: run.signal, ask: options.ask }, emit, run.onProgress);
            run.signal?.throwIfAborted();
          }
        }
        const summary = adapters.budgetSummary?.(session);
        const stop = `已达到 ${maxSteps} 轮执行上限，本次运行尚未完成。`;
        return await finish("incomplete", [stop, summary, "可提高 --max-steps，或恢复会话继续。"].filter(Boolean).join("\n"));
      } catch (error) {
        return await finish(wasCancelled(error, run.signal) ? "cancelled" : "error", errorMessage(error).slice(0, 600), error instanceof ModelRequestError ? error.failure : undefined);
      } finally { running = false; }
    }
  };
}

export type Agent = ReturnType<typeof createAgentRuntime>;
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
