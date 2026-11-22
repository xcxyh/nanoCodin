import { generateText, zodSchema } from "ai";
import type { CoreMessage, LanguageModel, ToolSet } from "ai";
import type { ModelHistory } from "../agent/history.js";
import type { Message, ModelResponse, TokenUsage } from "../agent/messages.js";
import type { ModelProviderName } from "../config/types.js";
import type { ModelGenerateOptions } from "./provider.js";
import { buildAiSdkToolSet } from "./tools.js";

function splitSystemAndPrompt(messages: Message[]): { system: string | undefined; prompt: string } {
  const systemMessages = messages.filter((message) => message.role === "system").map((message) => message.content);
  const prompt = messages
    .filter((message) => message.role !== "system")
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n\n");

  return {
    system: systemMessages.length > 0 ? systemMessages.join("\n\n") : undefined,
    prompt
  };
}

function estimateTokenCount(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return 0;
  }
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

export function estimateUsage(prompt: string, text: string): TokenUsage {
  const promptTokens = estimateTokenCount(prompt);
  const completionTokens = estimateTokenCount(text);
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    source: "estimated"
  };
}

export function normalizeUsage(
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined,
  prompt: string,
  text: string
): TokenUsage {
  return resolveUsage(usage, () => prompt, text);
}

function resolveUsage(usage: Parameters<typeof normalizeUsage>[0], prompt: () => string, text: string): TokenUsage {
  if (!usage || ![usage.promptTokens, usage.completionTokens, usage.totalTokens].every((value) => Number.isFinite(value) && value >= 0)) {
    return estimateUsage(prompt(), text);
  }

  return {
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
    source: "actual"
  };
}

export function isStructuredToolCallingDisabled(options?: ModelGenerateOptions): boolean {
  if (!options?.tools) {
    return true;
  }
  if (options.structuredToolCalling === false) {
    return true;
  }
  const override = process.env.NANOCODIN_TEXT_REACT?.trim().toLowerCase();
  return override === "1" || override === "true" || override === "yes" || override === "on";
}

function isStructuredToolCallingUnsupported(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const status = (error as { statusCode?: number })?.statusCode;
  if (![400, 404, 422, 501].includes(status ?? 0) && !(error instanceof Error && error.name === "AI_UnsupportedFunctionalityError")) return false;
  if (/schema|parameters|properties|additionalProperties|anyOf|oneOf/i.test(message)) return false;
  return /(?:tools?|tool_choice|function calling).{0,60}(?:unsupported|not support|not available)|(?:unsupported|not support).{0,60}(?:tools?|tool_choice|function calling)/i.test(message);
}

function toStructuredModelResponse(
  history: ModelHistory,
  result: {
    text: string;
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
    toolCalls?: Array<{ toolCallId?: string; toolName: string; args: unknown }>;
    finishReason?: string;
  }
): ModelResponse {
  const toolCalls = result.toolCalls?.map(call => ({
    ...(call.toolCallId ? { id: call.toolCallId } : {}), name: call.toolName, input: call.args
  }));
  return {
    text: result.text,
    usage: resolveUsage(result.usage, () => splitSystemAndPrompt(history.messages).prompt, result.text),
    structured: true,
    finishReason: result.finishReason,
    toolCall: toolCalls?.[0],
    toolCalls
  };
}

function nativeMessages(messages: readonly Message[]): CoreMessage[] {
  return messages.map((message): CoreMessage => {
    if (message.role === "assistant" && message.toolCalls?.length) return { role: "assistant", content: message.toolCalls.map((call) => ({ type: "tool-call", toolCallId: call.id, toolName: call.name, args: call.input as Record<string, unknown> })) };
    if (message.role === "tool") return message.toolCallId && message.name
      ? { role: "tool", content: [{ type: "tool-result", toolCallId: message.toolCallId, toolName: message.name, result: message.content }] }
      : { role: "user", content: `Historical tool result: ${message.content}` };
    return { role: message.role, content: message.content };
  });
}

export async function tryGenerateWithStructuredTools(
  model: LanguageModel,
  history: ModelHistory,
  options?: ModelGenerateOptions
): Promise<ModelResponse | null> {
  const structuredTools = options?.tools;
  if (isStructuredToolCallingDisabled(options) || !structuredTools) {
    return null;
  }

  const aiTools = buildAiSdkToolSet(structuredTools);
  try {
    const result = await generateText({
      model,
      messages: nativeMessages(history.nativeMessages),
      tools: aiTools,
      toolChoice: options.toolChoice ?? "auto",
      maxSteps: 1,
      maxRetries: 0,
      maxTokens: options.maxOutputTokens,
      abortSignal: options.abortSignal
    });
    return toStructuredModelResponse(history, result);
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    if (error instanceof Error && (error.name === "AI_NoSuchToolError" || error.name === "AI_InvalidToolArgumentsError")) {
      const failure = error as Error & { toolName?: string; cause?: { issues?: Array<{ path: unknown[]; message: string }>; cause?: { issues?: Array<{ path: unknown[]; message: string }> } } };
      const issues = failure.cause?.issues ?? failure.cause?.cause?.issues;
      const detail = issues?.slice(0, 8).map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") ?? "Input did not match the exact JSON schema.";
      return { text: "", error: `No tools were executed. ${failure.name}: ${failure.toolName ?? "requested tool"}. ${detail} Use the available tool names and input schemas: ${Object.keys(aiTools).join(", ")}.` };
    }
    if (!isStructuredToolCallingUnsupported(error)) {
      throw error;
    }
    return null;
  }
}

function isAbortError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  if (error instanceof Error && error.name === "AbortError") {
    return true;
  }
  return "isCanceled" in error && (error as { isCanceled?: unknown }).isCanceled === true;
}

interface WireMessage {
  role: string;
  content?: unknown;
  tool_call_id?: string;
  tool_calls?: { id: string }[];
  reasoning_content?: string;
}

function restoreContinuation(messages: WireMessage[], source: readonly Message[]) {
  const rebuilt: WireMessage[] = [];
  const downgraded = new Set<string>();
  for (const [index, message] of messages.entries()) {
    const metadata = source[index]?.providerData;
    if (message.role === "assistant" && typeof metadata?.reasoning_content === "string") message.reasoning_content = metadata.reasoning_content;
    if (message.role === "assistant" && message.reasoning_content === undefined) {
      for (const call of message.tool_calls ?? []) downgraded.add(call.id);
      const evidence = message.content || (message.tool_calls?.length ? JSON.stringify(message.tool_calls) : "");
      if (evidence) rebuilt.push({ role: "user", content: `Historical assistant requests/results (provider continuation unavailable; do not replay): ${evidence}` });
    } else if (message.role === "tool" && message.tool_call_id && downgraded.has(message.tool_call_id)) {
      rebuilt.push({ role: "user", content: `Historical tool result (inspect actual state; do not replay): ${message.content}` });
    } else rebuilt.push(message);
  }
  return rebuilt;
}

export function providerTransport(provider: ModelProviderName, continuation: boolean, history: ModelHistory, options: ModelGenerateOptions) {
  let providerData: Record<string, unknown> | undefined;
  const transportFetch = options.fetch ?? globalThis.fetch;
  const requestFetch: typeof fetch = async (url, init) => {
    let hasTools = false;
    if (provider === "openai" && typeof init?.body === "string") {
      const body = JSON.parse(init.body);

      hasTools = Boolean(body.tools?.length);
      if (options.reasoningEffort !== undefined) body.reasoning_effort = options.reasoningEffort;
      if (continuation && hasTools) body.messages = restoreContinuation(body.messages, history.nativeMessages);
      if (options.reasoningEffort !== undefined || (continuation && hasTools)) {
        init = { ...init, body: JSON.stringify(body) };
      }
    }
    const response = await transportFetch(url, init);
    if (provider === "openai" && response.ok && hasTools) {
      try {
        const body = await response.clone().json();
        const message = body.choices?.[0]?.message;
        if (typeof message?.reasoning_content === "string") { providerData = { reasoning_content: message.reasoning_content }; }
      } catch { /* The SDK still validates the original response and reports transport errors. */ }
    }
    return response;
  };
  return { fetch: requestFetch, get data() { return providerData; } };
}

export async function generateTextAction(model: LanguageModel, messages: Message[], options: ModelGenerateOptions) {
  const { system, prompt } = splitSystemAndPrompt(messages);
  const schemas = options.tools?.map((tool) => `- ${tool.name}: ${tool.description}\nInput: ${JSON.stringify(zodSchema(tool.schema).jsonSchema)}`).join("\n") ?? "";
  const protocol = `Tools:\n${schemas}\nReturn one text action:\nAction: <exact tool name or final>\nAction Input: <valid JSON object, multiline allowed>\nFor final use {"answer":"...","incomplete":false}. Set incomplete=true only when blocked and explain why.`;
  const result = await generateText({ model, system: `${system ?? ""}\n${protocol}`, prompt, maxRetries: 0, maxTokens: options.maxOutputTokens, abortSignal: options.abortSignal });
  return { text: result.text, usage: normalizeUsage(result.usage, prompt, result.text), finishReason: result.finishReason };
}
