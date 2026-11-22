import { generateFromHistory } from "../agent/model.js";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { generateTextAction, isStructuredToolCallingDisabled, providerTransport, tryGenerateWithStructuredTools } from "./protocol.js";
export { estimateUsage, normalizeUsage } from "./protocol.js";
import type { ModelHistory } from "../agent/history.js";
import type { Message, ModelResponse } from "../agent/messages.js";
import type { ModelProviderName, ResolvedModelConfig } from "../config/types.js";
import { type CompleteModelConfig, resolveModelConfigFromEnv } from "../config/model.js";
export { resolveModelConfigFromEnv, isModelConfigComplete } from "../config/model.js";
import { runModelRequest, requestPolicy } from "./request.js";
import type { Tool } from "../agent/tools.js";

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
    return this.requestHistory({ messages, nativeMessages: options?.nativeMessages ?? messages }, options);
  }

  async [generateFromHistory](history: ModelHistory, options?: ModelGenerateOptions): Promise<ModelResponse> {
    if (this.generate !== ApiModelProvider.prototype.generate) {
      return this.generate(history.messages, { ...options, nativeMessages: history.nativeMessages });
    }
    return this.requestHistory(history, options);
  }

  private requestHistory(history: ModelHistory, options?: ModelGenerateOptions) {
    return runModelRequest(this.config, options?.abortSignal, async (transport) => {
      if (this.config.provider === "anthropic" && options?.reasoningEffort !== undefined) throw new Error("reasoningEffort is an OpenAI-compatible option; use an appropriate Anthropic thinking adapter.");
      const requestOptions = { ...options, abortSignal: transport.signal, fetch: transport.fetch };
      try { return await this.generateAt(history, requestOptions); }
      catch (error) {
        if (!this.requiresContinuation && (error as { statusCode?: number })?.statusCode === 400 && /(?:reasoning_content.{0,100}(?:must|required|missing|pass)|(?:missing|required).{0,100}reasoning_content)/i.test(error instanceof Error ? error.message : String(error))) {
          this.requiresContinuation = true;
          return this.generateAt(history, requestOptions);
        }
        if (this.config.provider === "anthropic" && this.baseURL && isNotFoundError(error)
          && !/model/i.test(error instanceof Error ? error.message : String(error)) && !this.baseURL.replace(/\/+$/, "").endsWith("/v1")) {
          this.baseURL = normalizeAnthropicBaseURL(this.baseURL);
          return this.generateAt(history, requestOptions);
        }
        throw error;
      }
    }, options?.fetch);
  }

  private async generateAt(history: ModelHistory, options: ModelGenerateOptions): Promise<ModelResponse> {
    const wire = providerTransport(this.config.provider, this.requiresContinuation, history, options);
    const factory = this.config.provider === "openai" ? createOpenAI : createAnthropic;
    const model = factory({ apiKey: this.config.apiKey, baseURL: this.baseURL ?? undefined, fetch: wire.fetch })(this.config.name);
    const structured = await tryGenerateWithStructuredTools(model, history, {
      ...options, structuredToolCalling: this.structuredSupport && options.structuredToolCalling !== false
    });
    if (structured) return { ...structured, ...(wire.data ? { providerData: wire.data } : {}) };
    if (options.tools && !isStructuredToolCallingDisabled(options)) this.structuredSupport = false;
    return generateTextAction(model, history.messages, options);
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
