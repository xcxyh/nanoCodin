import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, zodSchema } from "ai";
import type { CoreMessage, LanguageModel, ToolChoice, ToolSet } from "ai";
import type { Message, ModelResponse, TokenUsage } from "../core/messageTypes.js";
import type { ModelProviderName, ResolvedModelConfig } from "../core/runtimeConfig.js";
import { resolveModelConfigFromEnv } from "../config/model.js";
export { resolveModelConfigFromEnv } from "../config/model.js";
import { runModelRequest, requestPolicy } from "./request.js";
import { buildAiSdkToolSet } from "./tools.js";
import type { Tool } from "../core/toolTypes.js";

export interface ModelGenerateOptions {
  abortSignal?: AbortSignal;
  fetch?: typeof fetch;
  nativeMessages?: readonly Message[];
  maxOutputTokens?: number;
  /** Explicit OpenAI-compatible wire option; never silently changes thinking defaults. */
  reasoningEffort?: "none" | "low" | "high" | "max";
  tools?: readonly Tool[];
  toolChoice?: "auto" | "required" | "none";
  structuredToolCalling?: boolean;
}

export interface ModelProvider {
  generate(messages: Message[], options?: ModelGenerateOptions): Promise<ModelResponse>;
}

type CompleteModelConfig = ResolvedModelConfig & {
  provider: ModelProviderName;
  name: string;
  apiKey: string;
};

function apiKeyEnvName(provider: ModelProviderName): string { return provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY"; }

export function getConfiguredModelName(config: Pick<ResolvedModelConfig, "provider" | "name">): string {
  if (config.provider !== "openai" && config.provider !== "anthropic") {
    throw new Error("MODEL_PROVIDER is required. Use 'openai' or 'anthropic'.");
  }
  if (!config.name) {
    throw new Error(`Model name is required when MODEL_PROVIDER=${config.provider}`);
  }
  return config.name;
}

export function getConfiguredModelNameFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return getConfiguredModelName(resolveModelConfigFromEnv(env));
}

export function isModelConfigComplete(config: ResolvedModelConfig): config is CompleteModelConfig {
  return (config.provider === "openai" || config.provider === "anthropic")
    && typeof config.name === "string"
    && config.name.length > 0
    && typeof config.apiKey === "string"
    && config.apiKey.length > 0;
}

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
  if (!usage || ![usage.promptTokens, usage.completionTokens, usage.totalTokens].every((value) => Number.isFinite(value) && value >= 0)) {
    return estimateUsage(prompt, text);
  }

  return {
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
    source: "actual"
  };
}

function toModelResponse(
  prompt: string,
  text: string,
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined
): ModelResponse {
  return {
    text,
    usage: normalizeUsage(usage, prompt, text)
  };
}

function normalizeToolChoice(toolChoice: ModelGenerateOptions["toolChoice"]): ToolChoice<ToolSet> {
  return toolChoice ?? "auto";
}

function isStructuredToolCallingDisabled(options?: ModelGenerateOptions): boolean {
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
  prompt: string,
  result: {
    text: string;
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
    toolCalls?: Array<{ toolCallId?: string; toolName: string; args: unknown }>;
    finishReason?: string;
  }
): ModelResponse {
  const toolCall = result.toolCalls?.[0];
  return {
    text: result.text,
    usage: normalizeUsage(result.usage, prompt, result.text),
    structured: true,
    finishReason: result.finishReason,
    toolCall: toolCall ? { ...(toolCall.toolCallId ? { id: toolCall.toolCallId } : {}), name: toolCall.toolName, input: toolCall.args } : undefined,
    toolCalls: result.toolCalls?.map((call) => ({ ...(call.toolCallId ? { id: call.toolCallId } : {}), name: call.toolName, input: call.args }))
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

async function tryGenerateWithStructuredTools(
  model: LanguageModel,
  messages: Message[],
  options?: ModelGenerateOptions
): Promise<ModelResponse | null> {
  const structuredTools = options?.tools;
  if (isStructuredToolCallingDisabled(options) || !structuredTools) {
    return null;
  }

  const { system, prompt } = splitSystemAndPrompt(messages);
  const aiTools = buildAiSdkToolSet(structuredTools);
  try {
    const result = await generateText({
      model,
      messages: nativeMessages(options.nativeMessages ?? messages),
      tools: aiTools,
      toolChoice: normalizeToolChoice(options.toolChoice),
      maxSteps: 1,
      maxRetries: 0,
      maxTokens: options.maxOutputTokens,
      abortSignal: options.abortSignal
    });
    return toStructuredModelResponse(prompt, result);
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

function normalizeAnthropicBaseURL(baseURL: string): string {
  const trimmed = baseURL.replace(/\/+$/, "");
  if (trimmed.endsWith("/v1")) {
    return trimmed;
  }
  return `${trimmed}/v1`;
}

function isNotFoundError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const maybeStatus = "statusCode" in error ? (error as { statusCode?: unknown }).statusCode : undefined;
  if (maybeStatus === 404 || maybeStatus === "404") {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /not found/i.test(message);
}

class ApiModelProvider implements ModelProvider {
  private structuredSupport = true;
  private requiresContinuation = false;
  private baseURL: string | null;

  constructor(private readonly config: CompleteModelConfig) {
    requestPolicy(config);
    this.baseURL = config.baseUrl;
    this.requiresContinuation = Boolean(config.baseUrl && new URL(config.baseUrl).hostname === "api.deepseek.com");
  }

  async generate(messages: Message[], options?: ModelGenerateOptions): Promise<ModelResponse> {
    return runModelRequest(this.config, options?.abortSignal, async (transport) => {
      if (this.config.provider === "anthropic" && options?.reasoningEffort !== undefined) throw new Error("reasoningEffort is an OpenAI-compatible option; use an appropriate Anthropic thinking adapter.");
      const requestOptions = { ...options, abortSignal: transport.signal, fetch: transport.fetch };
      try { return await this.generateAt(messages, requestOptions); }
      catch (error) {
        if (!this.requiresContinuation && (error as { statusCode?: number })?.statusCode === 400 && /(?:reasoning_content.{0,100}(?:must|required|missing|pass)|(?:missing|required).{0,100}reasoning_content)/i.test(error instanceof Error ? error.message : String(error))) {
          this.requiresContinuation = true;
          return this.generateAt(messages, requestOptions);
        }
        if (this.config.provider === "anthropic" && this.baseURL && isNotFoundError(error)
          && !/model/i.test(error instanceof Error ? error.message : String(error)) && !this.baseURL.replace(/\/+$/, "").endsWith("/v1")) {
          this.baseURL = normalizeAnthropicBaseURL(this.baseURL);
          return this.generateAt(messages, requestOptions);
        }
        throw error;
      }
    });
  }

  private async generateAt(messages: Message[], options: ModelGenerateOptions): Promise<ModelResponse> {
    let providerData: Record<string, unknown> | undefined;
    const transportFetch = options.fetch ?? globalThis.fetch;
    const requestFetch: typeof fetch = async (url, init) => {
      let hasTools = false;
      if (this.config.provider === "openai" && typeof init?.body === "string") {
        const body = JSON.parse(init.body);
        const source = options.nativeMessages ?? messages;
        hasTools = Boolean(body.tools?.length);
        if (options.reasoningEffort !== undefined) body.reasoning_effort = options.reasoningEffort;
        const requiresContinuation = this.requiresContinuation && hasTools;
        let index = 0; const rebuilt: any[] = []; const downgraded = new Set<string>();
        for (const message of body.messages ?? []) {
          const metadata = source[index++]?.providerData;
          if (message.role === "assistant" && requiresContinuation && typeof metadata?.reasoning_content === "string") message.reasoning_content = metadata.reasoning_content;
          if (message.role === "assistant" && requiresContinuation && message.reasoning_content === undefined) {
            for (const call of message.tool_calls ?? []) downgraded.add(call.id);
            const evidence = message.content || (message.tool_calls?.length ? JSON.stringify(message.tool_calls) : "");
            if (evidence) rebuilt.push({ role: "user", content: `Historical assistant requests/results (provider continuation unavailable; do not replay): ${evidence}` });
          } else if (message.role === "tool" && downgraded.has(message.tool_call_id)) {
            rebuilt.push({ role: "user", content: `Historical tool result (inspect actual state; do not replay): ${message.content}` });
          } else rebuilt.push(message);
        }
        init = { ...init, body: JSON.stringify({ ...body, messages: rebuilt }) };
      }
      const response = await transportFetch(url, init);
      if (this.config.provider === "openai" && response.ok && hasTools) {
        try {
          const body = await response.clone().json();
          const message = body.choices?.[0]?.message;
          if (typeof message?.reasoning_content === "string") { providerData = { reasoning_content: message.reasoning_content }; }
        } catch { /* The SDK still validates the original response and reports transport errors. */ }
      }
      return response;
    };
    const factory = this.config.provider === "openai" ? createOpenAI : createAnthropic;
    const model = factory({ apiKey: this.config.apiKey, baseURL: this.baseURL ?? undefined, fetch: requestFetch })(this.config.name);
    const structured = await tryGenerateWithStructuredTools(model, messages, {
      ...options, structuredToolCalling: this.structuredSupport && options.structuredToolCalling !== false
    });
    if (structured) return { ...structured, ...(providerData ? { providerData } : {}) };
    if (options.tools && !isStructuredToolCallingDisabled(options)) this.structuredSupport = false;
    const { system, prompt } = splitSystemAndPrompt(messages);
    const schemas = options.tools?.map((tool) => `- ${tool.name}: ${tool.description}\nInput: ${JSON.stringify(zodSchema(tool.schema).jsonSchema)}`).join("\n") ?? "";
    const protocol = `Tools:\n${schemas}\nReturn one text action:\nAction: <exact tool name or final>\nAction Input: <valid JSON object, multiline allowed>\nFor final use {"answer":"...","incomplete":false}. Set incomplete=true only when blocked and explain why.`;
    const result = await generateText({ model, system: `${system ?? ""}\n${protocol}`, prompt, maxRetries: 0, maxTokens: options.maxOutputTokens, abortSignal: options.abortSignal });
    return { ...toModelResponse(prompt, result.text, result.usage), finishReason: result.finishReason, ...(providerData ? { providerData } : {}) };
  }
}

function assertModelConfig(config: ResolvedModelConfig): CompleteModelConfig {
  if (config.provider !== "openai" && config.provider !== "anthropic") {
    throw new Error("MODEL_PROVIDER is required. Use 'openai' or 'anthropic'.");
  }
  if (!config.name) {
    throw new Error(`Model name is required when MODEL_PROVIDER=${config.provider}`);
  }
  if (config.baseUrl !== null) {
    let valid = false;
    try { valid = ["http:", "https:"].includes(new URL(config.baseUrl).protocol); } catch { /* Report without credentials. */ }
    if (!valid) throw new Error("Invalid model.baseUrl: expected an absolute HTTP(S) URL.");
  }
  if (!config.apiKey) {
    throw new Error(`${apiKeyEnvName(config.provider)} is required when MODEL_PROVIDER=${config.provider}`);
  }
  return {
    ...config,
    provider: config.provider,
    name: config.name,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl ?? null
  };
}

export function createModelProvider(config: ResolvedModelConfig): ModelProvider {
  const complete = assertModelConfig(config);

  return new ApiModelProvider(complete);
}

export function createModelProviderFromEnv(env: NodeJS.ProcessEnv = process.env): ModelProvider {
  return createModelProvider(resolveModelConfigFromEnv(env));
}
