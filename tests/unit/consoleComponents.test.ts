import { describe, expect, it } from "vitest";
import { formatTokenCountK, formatTotalTokenUsageText, formatTokenUsageText } from "../../src/ui/utils/tokenUsage.js";

describe("token usage formatting", () => {
  it("formats token counts in k units", () => {
    expect(formatTokenCountK(15)).toBe("0.02k");
    expect(formatTokenCountK(1000)).toBe("1k");
    expect(formatTokenCountK(1250)).toBe("1.25k");
  });

  it("returns null when token usage is missing", () => {
    expect(formatTokenUsageText(null)).toBeNull();
  });

  it("formats actual usage in k tokens without a source suffix", () => {
    expect(formatTokenUsageText({
      promptTokens: 10,
      completionTokens: 4,
      totalTokens: 14,
      source: "actual"
    })).toBe("Tokens: 0.01k input / 0k output / 0.01k total tokens");
  });

  it("formats estimated and mixed usage with source suffixes", () => {
    expect(formatTokenUsageText({
      promptTokens: 6,
      completionTokens: 2,
      totalTokens: 8,
      source: "estimated"
    })).toContain("total tokens (estimated)");

    expect(formatTokenUsageText({
      promptTokens: 12,
      completionTokens: 8,
      totalTokens: 20,
      source: "mixed"
    })).toContain("total tokens (mixed)");
  });

  it("formats footer token total text", () => {
    expect(formatTotalTokenUsageText(null)).toBe("0");
    expect(formatTotalTokenUsageText({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      source: "actual"
    })).toBe("0");
    expect(formatTotalTokenUsageText({
      promptTokens: 12,
      completionTokens: 8,
      totalTokens: 20,
      source: "mixed"
    })).toBe("0.02k (mixed)");
  });
});
