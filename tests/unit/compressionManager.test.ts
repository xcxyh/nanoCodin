import { describe, expect, it } from "vitest";
import { CompressionManager } from "../../src/services/compressionManager.js";
import type { AgentStep, Message } from "../../src/core/messageTypes.js";

describe("CompressionManager", () => {
  it("builds session memory with verification and failure notes when compressing", () => {
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

    const result = manager.maybeCompress(messages, steps, null);

    expect(result.compressed).toBe(true);
    expect(result.sessionMemory?.goal).toContain("Implement the fix");
    expect(result.sessionMemory?.touchedFiles).toContain("src/a.ts");
    expect(result.sessionMemory?.nextAction).toBeTruthy();
    expect(result.stepsForPrompt.some((step) => (step.observation ?? "").includes("ERROR: test failed"))).toBe(true);
    expect(result.stepsForPrompt.length).toBeLessThan(steps.length);
  });

  it("compresses before the fourth LLM request even when under the token threshold", () => {
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

    const result = manager.maybeCompress(messages, steps, null);

    expect(result.compressed).toBe(true);
    expect(result.stepsForPrompt).toHaveLength(2);
    expect(result.stepsForPrompt[0]?.thought).toBe("edit");
    expect(result.sessionMemory?.decisions).toContain("inspect");
  });
});
