import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import type { LanguageModel, ToolChoice, ToolSet } from "ai";
import type { Message, ModelResponse, TokenUsage } from "../core/messageTypes.js";
import type { ModelProviderName, ResolvedModelConfig } from "../core/runtimeConfig.js";
import { buildAiSdkToolSet } from "./aiSdkTools.js";
import type { ToolRegistry } from "../tools/registry.js";

export interface ModelGenerateOptions {
  abortSignal?: AbortSignal;
  tools?: ToolRegistry;
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

function toPrompt(messages: Message[]): string {
  return messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n\n");
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
  if (!usage) {
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
  return toolChoice ?? "required";
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
  return /tool|function|schema|unsupported|not support|not available|invalid.*tool|tool.*not/i.test(message);
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
    toolCall: toolCall ? { name: toolCall.toolName, input: toolCall.args } : undefined
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

class OpenAIProvider implements ModelProvider {
  constructor(private readonly config: CompleteModelConfig) {}

  async generate(messages: Message[], options?: ModelGenerateOptions): Promise<ModelResponse> {
    try {
      const openai = createOpenAI({
        apiKey: this.config.apiKey,
        baseURL: this.config.baseUrl ?? undefined
      });
      const modelFactory = openai(this.config.name);

      const structured = await tryGenerateWithStructuredTools(modelFactory, messages, options);
      if (structured) {
        return structured;
      }

      const prompt = toPrompt(messages);
      const { text, usage } = await generateText({
        model: modelFactory,
        prompt,
        abortSignal: options?.abortSignal
      });

      return toModelResponse(prompt, text, usage);
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      throw formatProviderError("openai", this.config.name, this.config.baseUrl, error);
    }
  }
}

class AnthropicProvider implements ModelProvider {
  constructor(private readonly config: CompleteModelConfig) {}

  async generate(messages: Message[], options?: ModelGenerateOptions): Promise<ModelResponse> {
    try {
      const anthropic = createAnthropic({
        apiKey: this.config.apiKey,
        baseURL: this.config.baseUrl ?? undefined
      });
      const modelFactory = anthropic(this.config.name);

      const structured = await tryGenerateWithStructuredTools(modelFactory, messages, options);
      if (structured) {
        return structured;
      }

      const prompt = toPrompt(messages);
      const { text, usage } = await generateText({
        model: modelFactory,
        prompt,
        abortSignal: options?.abortSignal
      });

      return toModelResponse(prompt, text, usage);
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      if (this.config.baseUrl && isNotFoundError(error) && !this.config.baseUrl.replace(/\/+$/, "").endsWith("/v1")) {
        const fallbackBaseURL = normalizeAnthropicBaseURL(this.config.baseUrl);
        try {
          const anthropic = createAnthropic({ apiKey: this.config.apiKey, baseURL: fallbackBaseURL });
          const modelFactory = anthropic(this.config.name);
          const structured = await tryGenerateWithStructuredTools(modelFactory, messages, options);
          if (structured) {
            return structured;
          }
          const prompt = toPrompt(messages);
          const { text, usage } = await generateText({
            model: modelFactory,
            prompt,
            abortSignal: options?.abortSignal
          });
          return toModelResponse(prompt, text, usage);
        } catch (retryError) {
          if (isAbortError(retryError)) {
            throw retryError;
          }
          throw formatProviderError("anthropic", this.config.name, fallbackBaseURL, retryError);
        }
      }
      throw formatProviderError("anthropic", this.config.name, this.config.baseUrl, error);
    }
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

  if (complete.provider === "openai") {
    return new OpenAIProvider(complete);
  }

  return new AnthropicProvider(complete);
}

export function createModelProviderFromEnv(env: NodeJS.ProcessEnv = process.env): ModelProvider {
  return createModelProvider(resolveModelConfigFromEnv(env));
}
