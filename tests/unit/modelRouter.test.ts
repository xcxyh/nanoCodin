import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ToolRegistry } from "../../src/tools/registry.js";

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

  it("maps AI SDK tool calls into model responses", async () => {
    process.env.MODEL_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-key";
    hoisted.generateTextSpy.mockResolvedValue({
      text: "selecting a tool",
      finishReason: "tool-calls",
      toolCalls: [{ type: "tool-call", toolCallId: "1", toolName: "echo", args: { text: "hello" } }],
      usage: {
        promptTokens: 3,
        completionTokens: 2,
        totalTokens: 5
      }
    });
    const tools = new ToolRegistry([
      {
        name: "echo",
        description: "Echo text",
        schema: z.object({ text: z.string() }),
        execute: async ({ text }) => ({ ok: true, output: text })
      }
    ]);

    const { createModelProviderFromEnv } = await import("../../src/llm/modelRouter.js");
    const provider = createModelProviderFromEnv();
    const result = await provider.generate([
      { role: "system", content: "system prompt" },
      { role: "user", content: "hello world" }
    ], { tools });

    expect(result.structured).toBe(true);
    expect(result.finishReason).toBe("tool-calls");
    expect(result.toolCall).toEqual({ name: "echo", input: { text: "hello" } });
    expect(hoisted.generateTextSpy).toHaveBeenCalledWith(expect.objectContaining({
      system: "system prompt",
      prompt: "USER: hello world",
      toolChoice: "required",
      maxSteps: 1,
      tools: expect.objectContaining({
        echo: expect.objectContaining({ description: "Echo text" }),
        final: expect.any(Object)
      })
    }));
  });

  it("falls back to text ReAct when structured tool calling is unsupported", async () => {
    process.env.MODEL_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-key";
    hoisted.generateTextSpy
      .mockRejectedValueOnce(new Error("tools unsupported by this endpoint"))
      .mockResolvedValueOnce({
        text: "Thought: done\nAction: final\nAction Input: {\"answer\":\"ok\"}"
      });
    const tools = new ToolRegistry([
      {
        name: "echo",
        description: "Echo text",
        schema: z.object({ text: z.string() }),
        execute: async ({ text }) => ({ ok: true, output: text })
      }
    ]);

    const { createModelProviderFromEnv } = await import("../../src/llm/modelRouter.js");
    const provider = createModelProviderFromEnv();
    const result = await provider.generate([{ role: "user", content: "hello world" }], { tools });

    expect(result.structured).toBeUndefined();
    expect(result.toolCall).toBeUndefined();
    expect(result.text).toContain("Action: final");
    expect(hoisted.generateTextSpy).toHaveBeenCalledTimes(2);
    expect(hoisted.generateTextSpy.mock.calls[1]?.[0]).toMatchObject({
      prompt: "USER: hello world"
    });
  });

  it("honors the text ReAct override even when tools are available", async () => {
    process.env.MODEL_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-key";
    process.env.NANOCODIN_TEXT_REACT = "1";
    hoisted.generateTextSpy.mockResolvedValue({
      text: "Thought: done\nAction: final\nAction Input: {\"answer\":\"ok\"}"
    });
    const tools = new ToolRegistry([
      {
        name: "echo",
        description: "Echo text",
        schema: z.object({ text: z.string() }),
        execute: async ({ text }) => ({ ok: true, output: text })
      }
    ]);

    const { createModelProviderFromEnv } = await import("../../src/llm/modelRouter.js");
    const provider = createModelProviderFromEnv();
    const result = await provider.generate([{ role: "user", content: "hello world" }], { tools });

    expect(result.structured).toBeUndefined();
    expect(result.toolCall).toBeUndefined();
    expect(hoisted.generateTextSpy).toHaveBeenCalledTimes(1);
    expect(hoisted.generateTextSpy).toHaveBeenCalledWith(expect.not.objectContaining({
      tools: expect.anything()
    }));
  });
});
