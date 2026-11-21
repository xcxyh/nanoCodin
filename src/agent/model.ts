import { randomUUID } from "node:crypto";
import type { AgentEvent } from "./session.js";
import { ModelRequestError, type Message, type ModelResponse, type ToolCall } from "./messages.js";
import type { Tool } from "./tools.js";
import type { ModelHistory } from "./history.js";
import { finalToolSchema, parseTextAction } from "./protocol.js";

export interface ModelOptions {
  tools?: readonly Tool[];
  abortSignal?: AbortSignal;
  nativeMessages?: readonly Message[];
}

export interface Model {
  generate(messages: Message[], options?: ModelOptions): Promise<ModelResponse>;
}

type ModelAction =
  | { type: "tools"; calls: ToolCall[] }
  | { type: "final"; answer: string; incomplete: boolean }
  | { type: "invalid"; reason: string };

// Keep the faster built-in path separate from a custom model's public generate() contract.
export const generateFromHistory = Symbol("generateFromHistory");
interface HistoryModel extends Model {
  [generateFromHistory]?(history: ModelHistory, options: ModelOptions): Promise<ModelResponse>;
}

function generate(model: HistoryModel, history: ModelHistory, options: ModelOptions) {
  if (model[generateFromHistory]) return model[generateFromHistory](history, options);
  return model.generate(history.messages, {
    ...options,
    nativeMessages: history.nativeMessages
  });
}

export function modelAction(response: ModelResponse): ModelAction {
  const invalid = (reason: string): ModelAction => ({ type: "invalid", reason });
  if (response.finishReason === "content-filter") {
    return { type: "final", incomplete: true, answer: "模型内容过滤阻止了本次请求，任务尚未完成。" };
  }
  if (response.error || response.finishReason === "error") return invalid(response.error ?? "Model returned an error finish reason.");
  if (response.finishReason === "length") return invalid("Response truncated. Return a shorter valid action.");
  let calls = response.toolCalls?.length ? response.toolCalls : response.toolCall ? [response.toolCall] : [];
  if (!calls.length) {
    if (response.finishReason === "tool-calls") return invalid("Model reported tool calls but provided none.");
    try { calls = [parseTextAction(response.text)]; }
    catch (error) { return invalid(error instanceof Error ? error.message : String(error)); }
  }
  const ids = calls.flatMap(call => call.id ? [call.id] : []);
  if (new Set(ids).size !== ids.length) return invalid("Duplicate tool call IDs. No calls were executed.");
  const final = calls.find(call => call.name === "final");
  if (!final) return { type: "tools", calls };
  if (calls.length !== 1) return invalid("Send final alone after receiving all tool results. No calls in this mixed batch were executed.");
  const parsed = finalToolSchema.safeParse(final.input);
  if (!parsed.success) return invalid("final requires a non-empty answer string and optional boolean incomplete.");
  return { type: "final", answer: parsed.data.answer, incomplete: parsed.data.incomplete === true };
}

export async function requestAction(model: Model, history: () => ModelHistory, options: ModelOptions,
  round: number, emit: (event: AgentEvent) => Promise<void>) {
  const requestId = randomUUID();
  const signal = options.abortSignal;
  await emit({ at: Date.now(), type: "model_start", requestId, round });
  let response: ModelResponse;
  try {
    signal?.throwIfAborted();
    response = await generate(model, history(), options);
  } catch (error) {
    await emit({
      at: Date.now(), type: "model_end", requestId, status: wasCancelled(error, signal) ? "cancelled" : "error",
      ...(error instanceof ModelRequestError ? { failure: error.failure } : {})
    });
    throw error;
  }
  await emit({
    at: Date.now(), type: "model_end", requestId, status: signal?.aborted ? "cancelled" : "complete",
    ...(response.request ? { request: response.request } : {}),
    ...(response.providerData ? { providerData: response.providerData } : {})
  });
  signal?.throwIfAborted();
  if (response.usage) await emit({ at: Date.now(), type: "usage", usage: response.usage });
  return modelAction(response);
}

export function wasCancelled(error: unknown, signal?: AbortSignal) {
  return signal?.aborted || (error instanceof Error && error.name === "AbortError")
    || (error instanceof ModelRequestError && error.failure.kind === "cancelled");
}
