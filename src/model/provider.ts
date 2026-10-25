import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, zodSchema } from "ai";
import type { LanguageModel, ToolChoice, ToolSet } from "ai";
import type { Message, ModelResponse, TokenUsage } from "../core/messageTypes.js";
import type { ModelProviderName, ResolvedModelConfig } from "../core/runtimeConfig.js";
import { buildAiSdkToolSet } from "./tools.js";
import type { Tool } from "../core/toolTypes.js";

export interface ModelGenerateOptions {
  abortSignal?: AbortSignal;
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

function defaultModelName(provider: ModelProviderName): string {
  return provider === "anthropic" ? "claude-3-5-haiku-latest" : "gpt-4o-mini";
}

function apiKeyEnvName(provider: ModelProviderName): string {
  return provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
}

function resolveProviderFromEnv(env: NodeJS.ProcessEnv): ModelProviderName {
  return env.MODEL_PROVIDER === "anthropic" ? "anthropic" : "openai";
}

export function resolveModelConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ResolvedModelConfig {
  const provider = resolveProviderFromEnv(env);
  return {
    provider,
    name: env.MODEL_NAME
      ?? (provider === "anthropic" ? env.ANTHROPIC_MODEL : env.OPENAI_MODEL)
      ?? defaultModelName(provider),
    baseUrl: env.MODEL_BASE_URL
      ?? (provider === "anthropic" ? env.ANTHROPIC_BASE_URL : env.OPENAI_BASE_URL)
      ?? null,
    apiKey: env.MODEL_API_KEY
      ?? (provider === "anthropic" ? env.ANTHROPIC_API_KEY : env.OPENAI_API_KEY)
      ?? null
  };
}

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
  return /(?:tools?|tool_choice|function calling).{0,60}(?:unsupported|not support|not available)|(?:unsupported|not support).{0,60}(?:tools?|tool_choice|function calling)/i.test(message);
}

function toStructuredModelResponse(
  prompt: string,
  result: {
    text: string;
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
    toolCalls?: Array<{ toolName: string; args: unknown }>;
    finishReason?: string;
  }
): ModelResponse {
  const toolCall = result.toolCalls?.[0];
  return {
    text: result.text,
    usage: normalizeUsage(result.usage, prompt, result.text),
    structured: true,
    finishReason: result.finishReason,
    toolCall: toolCall ? { name: toolCall.toolName, input: toolCall.args } : undefined,
    toolCalls: result.toolCalls?.map((call) => ({ name: call.toolName, input: call.args }))
  };
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
      system,
      prompt,
      tools: aiTools,
      toolChoice: normalizeToolChoice(options.toolChoice),
      maxSteps: 1,
      abortSignal: options.abortSignal
    });
    return toStructuredModelResponse(prompt, result);
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    if (error instanceof Error && (error.name === "AI_NoSuchToolError" || error.name === "AI_InvalidToolArgumentsError")) {
      return { text: "", error: `No tools were executed. ${error.message} Use the available tool names and input schemas.` };
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

function formatProviderError(
  provider: ModelProviderName,
  modelName: string,
  baseURL: string | null,
  error: unknown
): Error {
  const message = error instanceof Error ? error.message : String(error);
  const statusCode = typeof error === "object" && error !== null && "statusCode" in error
    ? String((error as { statusCode?: unknown }).statusCode ?? "")
    : "";
  const responseBody = typeof error === "object" && error !== null && "responseBody" in error
    ? String((error as { responseBody?: unknown }).responseBody ?? "")
    : "";

  const parts = [
    `LLM request failed for provider=${provider}`,
    `model=${modelName}`,
    `baseURL=${baseURL ?? "(default)"}`,
    statusCode ? `status=${statusCode}` : "",
    `message=${message}`,
    responseBody ? `response=${responseBody}` : "",
    "Hint: check API key, model name, and base URL path."
  ].filter(Boolean);

  return new Error(parts.join(" | "));
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
  private baseURL: string | null;

  constructor(private readonly config: CompleteModelConfig) {
    this.baseURL = config.baseUrl;
  }

  async generate(messages: Message[], options?: ModelGenerateOptions): Promise<ModelResponse> {
    const abortSignal = AbortSignal.any([
      ...(options?.abortSignal ? [options.abortSignal] : []), AbortSignal.timeout(120_000)
    ]);
    const requestOptions = { ...options, abortSignal };
    try {
      return await this.generateAt(messages, requestOptions);
    } catch (error) {
      if (isAbortError(error)) throw error;
      if (this.config.provider === "anthropic" && this.baseURL && isNotFoundError(error) && !this.baseURL.replace(/\/+$/, "").endsWith("/v1")) {
        this.baseURL = normalizeAnthropicBaseURL(this.baseURL);
        try {
          return await this.generateAt(messages, requestOptions);
        } catch (retryError) {
          if (isAbortError(retryError)) throw retryError;
          throw formatProviderError(this.config.provider, this.config.name, this.baseURL, retryError);
        }
      }
      throw formatProviderError(this.config.provider, this.config.name, this.baseURL, error);
    }
  }

  private async generateAt(messages: Message[], options: ModelGenerateOptions): Promise<ModelResponse> {
    const factory = this.config.provider === "openai" ? createOpenAI : createAnthropic;
    const model = factory({ apiKey: this.config.apiKey, baseURL: this.baseURL ?? undefined })(this.config.name);
    const structured = await tryGenerateWithStructuredTools(model, messages, {
      ...options, structuredToolCalling: this.structuredSupport && options.structuredToolCalling !== false
    });
    if (structured) return structured;
    if (options.tools && !isStructuredToolCallingDisabled(options)) this.structuredSupport = false;
    const { system, prompt } = splitSystemAndPrompt(messages);
    const schemas = options.tools?.map((tool) => `- ${tool.name}: ${tool.description}\nInput: ${JSON.stringify(zodSchema(tool.schema).jsonSchema)}`).join("\n") ?? "";
    const protocol = `Tools:\n${schemas}\nReturn one text action:\nAction: <exact tool name or final>\nAction Input: <valid JSON object, multiline allowed>\nFor final use {"answer":"...","incomplete":false}. Set incomplete=true only when blocked and explain why.`;
    const result = await generateText({ model, system: `${system ?? ""}\n${protocol}`, prompt, abortSignal: options.abortSignal });
    return { ...toModelResponse(prompt, result.text, result.usage), finishReason: result.finishReason };
  }
}

function assertModelConfig(config: ResolvedModelConfig): CompleteModelConfig {
  if (config.provider !== "openai" && config.provider !== "anthropic") {
    throw new Error("MODEL_PROVIDER is required. Use 'openai' or 'anthropic'.");
  }
  if (!config.name) {
    throw new Error(`Model name is required when MODEL_PROVIDER=${config.provider}`);
  }
  if (!config.apiKey) {
    throw new Error(`${apiKeyEnvName(config.provider)} is required when MODEL_PROVIDER=${config.provider}`);
  }
  return {
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
