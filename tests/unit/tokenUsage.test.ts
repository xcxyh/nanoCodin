import { describe, expect, it } from "vitest";
import { accumulateTokenUsage } from "../../src/core/messageTypes.js";
import { estimateUsage, normalizeUsage } from "../../src/llm/modelRouter.js";

describe("token usage helpers", () => {
  it("estimates usage when provider usage is unavailable", () => {
    const usage = estimateUsage("USER: hello world", "assistant reply");

    expect(usage.source).toBe("estimated");
    expect(usage.promptTokens).toBeGreaterThan(0);
    expect(usage.completionTokens).toBeGreaterThan(0);
    expect(usage.totalTokens).toBe(usage.promptTokens + usage.completionTokens);
  });

  it("normalizes actual usage without changing totals", () => {
    const usage = normalizeUsage(
      { promptTokens: 12, completionTokens: 5, totalTokens: 17 },
      "ignored prompt",
      "ignored text"
    );

    expect(usage).toEqual({
      promptTokens: 12,
      completionTokens: 5,
      totalTokens: 17,
      source: "actual"
    });
  });

  it("marks mixed sources when task-level usage accumulates across actual and estimated calls", () => {
    const actual = normalizeUsage(
      { promptTokens: 8, completionTokens: 3, totalTokens: 11 },
      "prompt",
      "text"
    );
    const estimated = estimateUsage("another prompt", "another text");

    const mixed = accumulateTokenUsage(actual, estimated);

    expect(mixed?.promptTokens).toBe(actual.promptTokens + estimated.promptTokens);
    expect(mixed?.completionTokens).toBe(actual.completionTokens + estimated.completionTokens);
    expect(mixed?.totalTokens).toBe(actual.totalTokens + estimated.totalTokens);
    expect(mixed?.source).toBe("mixed");
  });
});
