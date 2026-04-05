import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  generateTextSpy: vi.fn(),
  openaiFactorySpy: vi.fn(),
  anthropicFactorySpy: vi.fn()
}));

vi.mock("ai", () => ({
  generateText: hoisted.generateTextSpy
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: (...args: unknown[]) => {
    hoisted.openaiFactorySpy(...args);
    return () => ({ provider: "openai-model" });
  }
}));

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: (...args: unknown[]) => {
    hoisted.anthropicFactorySpy(...args);
    return () => ({ provider: "anthropic-model" });
  }
}));

describe("modelRouter token usage", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env = { ...envBackup };
    hoisted.generateTextSpy.mockReset();
    hoisted.openaiFactorySpy.mockReset();
    hoisted.anthropicFactorySpy.mockReset();
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it("returns actual usage for openai responses when the SDK provides it", async () => {
    process.env.MODEL_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-key";
    hoisted.generateTextSpy.mockResolvedValue({
      text: "done",
      usage: {
        promptTokens: 11,
        completionTokens: 7,
        totalTokens: 18
      }
    });

    const { createModelProviderFromEnv } = await import("../../src/llm/modelRouter.js");
    const provider = createModelProviderFromEnv();
    const result = await provider.generate([{ role: "user", content: "hello world" }]);

    expect(result.usage).toEqual({
      promptTokens: 11,
      completionTokens: 7,
      totalTokens: 18,
      source: "actual"
    });
  });

  it("falls back to estimated usage when the SDK omits usage", async () => {
    process.env.MODEL_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "test-key";
    hoisted.generateTextSpy.mockResolvedValue({
      text: "finished"
    });

    const { createModelProviderFromEnv } = await import("../../src/llm/modelRouter.js");
    const provider = createModelProviderFromEnv();
    const result = await provider.generate([{ role: "user", content: "please solve this task" }]);

    expect(result.usage?.source).toBe("estimated");
    expect(result.usage?.promptTokens).toBeGreaterThan(0);
    expect(result.usage?.completionTokens).toBeGreaterThan(0);
    expect(result.usage?.totalTokens).toBe((result.usage?.promptTokens ?? 0) + (result.usage?.completionTokens ?? 0));
  });
});
