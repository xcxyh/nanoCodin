import { describe, expect, it } from "vitest";
import { CompressionManager } from "../../src/services/compressionManager.js";
import type { AgentStep, Message } from "../../src/core/messageTypes.js";

describe("CompressionManager", () => {
  it("builds compression snapshots and prompt memory blocks when compressing", () => {
    const manager = new CompressionManager({
      enabled: true,
      tokenThresholdRatio: 0.1,
      retainRecentRatio: 0.5,
      contextTokenBudget: 100
    });

    const messages: Message[] = [
      { role: "user", content: "Implement the fix and run test plus typecheck." }
    ];
    const steps: AgentStep[] = [
      { thought: "inspect", action: { name: "view", input: { path: "src/a.ts" } }, observation: "OK: file opened" },
      { thought: "edit", action: { name: "str_replace", input: { path: "src/a.ts" } }, observation: "OK: replaced text" },
      { thought: "verify", action: { name: "bash", input: { command: "npm run test" } }, observation: "ERROR: test failed on line 10" },
      { thought: "retry", action: { name: "bash", input: { command: "npm run typecheck" } }, observation: "OK: typecheck passed" }
    ];

    const updated = manager.maybeCompress(messages, steps, {
      goal: "Implement the fix and run test plus typecheck.",
      activePlan: ["Inspect", "Edit", "Verify"],
      touchedFiles: ["src/a.ts"],
      openQuestions: ["Verify: run checks"],
      verification: ["npm run test"],
      recentFailures: ["ERROR: test failed on line 10"],
      nextAction: "Run verification"
    }, {
      entries: [],
      legacyText: null
    });

    expect(updated.compressed).toBe(true);
    expect(updated.compressionSnapshot?.completedWork.join("\n")).toContain("src/a.ts");
    expect(updated.promptMemoryBlock.workingMemory).toContain("Goal: Implement the fix");
    expect(updated.promptMemoryBlock.compressedHistory).toContain("Important evidence:");
    expect(updated.stepsForPrompt.some((step) => (step.observation ?? "").includes("npm run test"))).toBe(true);
    expect(updated.stepsForPrompt.length).toBeLessThan(steps.length);
  });

  it("does not compress before enough steps accumulate under the token threshold", () => {
    const manager = new CompressionManager({
      enabled: true,
      tokenThresholdRatio: 0.9,
      retainRecentRatio: 0.6,
      contextTokenBudget: 10_000
    });

    const messages: Message[] = [
      { role: "user", content: "Make the change." },
      { role: "tool", content: "OK: opened file" },
      { role: "tool", content: "OK: updated file" },
      { role: "tool", content: "OK: prepared verification" }
    ];
    const steps: AgentStep[] = [
      { thought: "inspect", action: { name: "view", input: { path: "src/a.ts" } }, observation: "OK: opened file" },
      { thought: "edit", action: { name: "str_replace", input: { path: "src/a.ts" } }, observation: "OK: updated file" },
      { thought: "verify", action: { name: "bash", input: { command: "npm run test" } }, observation: "OK: prepared verification" }
    ];

    const result = manager.maybeCompress(messages, steps, null, {
      entries: [],
      legacyText: null
    });

    expect(result.compressed).toBe(false);
    expect(result.stepsForPrompt).toEqual(steps);
    expect(result.compressionSnapshot).toBeNull();
  });
});
