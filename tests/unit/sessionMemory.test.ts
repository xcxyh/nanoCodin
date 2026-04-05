import { describe, expect, it } from "vitest";
import type { AgentStep, Message } from "../../src/core/messageTypes.js";
import { buildSessionMemory } from "../../src/services/sessionMemory.js";

describe("buildSessionMemory", () => {
  it("uses the latest user message as the goal instead of the last tool output", () => {
    const messages: Message[] = [
      { role: "user", content: "Fix the failing tests." },
      { role: "tool", content: "OK: extremely long tool output\nline\nline\nline" }
    ];

    const result = buildSessionMemory(messages, [], []);

    expect(result.goal).toBe("Fix the failing tests.");
  });

  it("stores only compact summaries for verification and failure notes", () => {
    const steps: AgentStep[] = [
      {
        thought: "verify",
        action: { name: "bash", input: { command: "npm run test" } },
        observation: "ERROR: test failed on line 10\nstack line 1\nstack line 2"
      },
      {
        thought: "plan verification",
        action: { name: "todo", input: {} },
        observation: "Run test before final answer\nnpm run test\nnpm run typecheck"
      }
    ];

    const result = buildSessionMemory(
      [{ role: "user", content: "Fix the bug." }],
      steps,
      []
    );

    expect(result.failureNotes).toEqual(["ERROR: test failed on line 10"]);
    expect(result.pendingVerification).toEqual(["Run test before final answer"]);
  });
});
