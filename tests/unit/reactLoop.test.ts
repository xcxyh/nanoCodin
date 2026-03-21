import { describe, expect, it } from "vitest";
import { buildAgentMessagesWithContext, parseAgentResponse } from "../../src/agent/reactLoop.js";

describe("parseAgentResponse", () => {
  it("parses standard Thought/Action/Action Input", () => {
    const parsed = parseAgentResponse([
      "Thought: inspect config",
      "Action: view",
      "Action Input: {\"path\":\"package.json\"}"
    ].join("\n"));

    expect(parsed.thought).toBe("inspect config");
    expect(parsed.action).toBe("view");
    expect(parsed.actionInput).toEqual({ path: "package.json" });
  });

  it("parses inline JSON in Action field", () => {
    const parsed = parseAgentResponse([
      "Thought: run checks",
      "Action: bash {\"command\":\"npm run typecheck\"}"
    ].join("\n"));

    expect(parsed.action).toBe("bash");
    expect(parsed.actionInput).toEqual({ command: "npm run typecheck" });
  });

  it("falls back to empty object for invalid JSON on non-final actions", () => {
    const parsed = parseAgentResponse([
      "Thought: list files",
      "Action: ls",
      "Action Input: {this is not json}"
    ].join("\n"));

    expect(parsed.action).toBe("ls");
    expect(parsed.actionInput).toEqual({});
  });

  it("falls back to answer text for final action when input is invalid", () => {
    const parsed = parseAgentResponse([
      "Thought: done",
      "Action: final",
      "Action Input: not-json-answer"
    ].join("\n"));

    expect(parsed.action).toBe("final");
    expect(parsed.actionInput).toEqual({ answer: "not-json-answer" });
  });

  it("builds layered prompt context", async () => {
    const messages = await buildAgentMessagesWithContext(
      [{ role: "user", content: "Inspect the project." }],
      [],
      "- view: read files",
      "discover",
      {
        goal: "Inspect the project.",
        decisions: ["Use repo index first"],
        touchedFiles: ["src/index.ts"],
        pendingVerification: [],
        failureNotes: [],
        nextAction: "Read the entrypoint"
      },
      {
        projectRules: ["Keep diffs small"],
        projectContext: "Use npm run typecheck for TS checks.",
        persistentMemory: "Avoid broad scans."
      },
      "Todo state:\n(none)",
      "- Read-only tools: view"
    );

    expect(messages[0]?.content).toContain("Project rules:");
    expect(messages[0]?.content).toContain("Keep diffs small");
    expect(messages[0]?.content).toContain("Persistent memory:");
    expect(messages[1]?.content).toContain("Session memory summary:");
    expect(messages[1]?.content).toContain("&quot;nextAction&quot;: &quot;Read the entrypoint&quot;");
  });
});
