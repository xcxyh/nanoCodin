import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import type { LanguageModel, ToolChoice, ToolSet } from "ai";
import type { Message, ModelResponse, TokenUsage } from "../core/messageTypes.js";
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

function toPrompt(messages: Message[]): string {
  return messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
}

function splitSystemAndPrompt(messages: Message[]): { system: string | undefined; prompt: string } {
  const systemMessages = messages.filter((m) => m.role === "system").map((m) => m.content);
  const prompt = messages
    .filter((m) => m.role !== "system")
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
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
  provider: "openai" | "anthropic",
  modelName: string,
  baseURL: string | undefined,
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
  private readonly modelName: string;

  constructor(modelName: string) {
    this.modelName = modelName;
  }

  async generate(messages: Message[], options?: ModelGenerateOptions): Promise<ModelResponse> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is required when MODEL_PROVIDER=openai");
    }

    const baseURL = process.env.OPENAI_BASE_URL;
    try {
      const openai = createOpenAI({ apiKey, baseURL });
      const modelFactory = openai(this.modelName);

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
      throw formatProviderError("openai", this.modelName, baseURL, error);
    }
  }
}

class AnthropicProvider implements ModelProvider {
  private readonly modelName: string;

  constructor(modelName: string) {
    this.modelName = modelName;
  }

  async generate(messages: Message[], options?: ModelGenerateOptions): Promise<ModelResponse> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is required when MODEL_PROVIDER=anthropic");
    }

    const baseURL = process.env.ANTHROPIC_BASE_URL;
    try {
      const anthropic = createAnthropic({ apiKey, baseURL });
      const modelFactory = anthropic(this.modelName);

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
      if (baseURL && isNotFoundError(error) && !baseURL.replace(/\/+$/, "").endsWith("/v1")) {
        const fallbackBaseURL = normalizeAnthropicBaseURL(baseURL);
        try {
          const anthropic = createAnthropic({ apiKey, baseURL: fallbackBaseURL });
          const modelFactory = anthropic(this.modelName);
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
          throw formatProviderError("anthropic", this.modelName, fallbackBaseURL, retryError);
        }
      }
      throw formatProviderError("anthropic", this.modelName, baseURL, error);
    }
  }
}

export function createModelProviderFromEnv(): ModelProvider {
  const provider = (process.env.MODEL_PROVIDER ?? "openai").toLowerCase();

  if (provider === "openai") {
    const modelName = process.env.MODEL_NAME ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
    return new OpenAIProvider(modelName);
  }

  if (provider === "anthropic") {
    const modelName = process.env.MODEL_NAME ?? process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-latest";
    return new AnthropicProvider(modelName);
  }

  throw new Error(`Unsupported MODEL_PROVIDER: ${provider}. Use 'openai' or 'anthropic'.`);
}
