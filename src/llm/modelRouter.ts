import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import type { Message, ModelResponse, TokenUsage } from "../core/messageTypes.js";

export interface ModelProvider {
  generate(messages: Message[]): Promise<ModelResponse>;
}

function toPrompt(messages: Message[]): string {
  return messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
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

  async generate(messages: Message[]): Promise<ModelResponse> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is required when MODEL_PROVIDER=openai");
    }

    const baseURL = process.env.OPENAI_BASE_URL;
    try {
      const openai = createOpenAI({ apiKey, baseURL });
      const modelFactory = openai(this.modelName);

      const prompt = toPrompt(messages);
      const { text, usage } = await generateText({
        model: modelFactory,
        prompt
      });

      return toModelResponse(prompt, text, usage);
    } catch (error) {
      throw formatProviderError("openai", this.modelName, baseURL, error);
    }
  }
}

class AnthropicProvider implements ModelProvider {
  private readonly modelName: string;

  constructor(modelName: string) {
    this.modelName = modelName;
  }

  async generate(messages: Message[]): Promise<ModelResponse> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is required when MODEL_PROVIDER=anthropic");
    }

    const baseURL = process.env.ANTHROPIC_BASE_URL;
    try {
      const anthropic = createAnthropic({ apiKey, baseURL });
      const modelFactory = anthropic(this.modelName);

      const prompt = toPrompt(messages);
      const { text, usage } = await generateText({
        model: modelFactory,
        prompt
      });

      return toModelResponse(prompt, text, usage);
    } catch (error) {
      if (baseURL && isNotFoundError(error) && !baseURL.replace(/\/+$/, "").endsWith("/v1")) {
        const fallbackBaseURL = normalizeAnthropicBaseURL(baseURL);
        try {
          const anthropic = createAnthropic({ apiKey, baseURL: fallbackBaseURL });
          const modelFactory = anthropic(this.modelName);
          const prompt = toPrompt(messages);
          const { text, usage } = await generateText({
            model: modelFactory,
            prompt
          });
          return toModelResponse(prompt, text, usage);
        } catch (retryError) {
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
