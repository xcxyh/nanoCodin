import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import type { Message, ModelResponse } from "../core/messageTypes.js";

export interface ModelProvider {
  generate(messages: Message[]): Promise<ModelResponse>;
}

function toPrompt(messages: Message[]): string {
  return messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
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
    const openai = createOpenAI({ apiKey, baseURL });
    const modelFactory = openai(this.modelName);

    const { text } = await generateText({
      model: modelFactory,
      prompt: toPrompt(messages)
    });

    return { text };
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
    const anthropic = createAnthropic({ apiKey, baseURL });
    const modelFactory = anthropic(this.modelName);

    const { text } = await generateText({
      model: modelFactory,
      prompt: toPrompt(messages)
    });

    return { text };
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
