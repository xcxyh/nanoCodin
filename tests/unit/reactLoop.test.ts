import { describe, expect, it } from "vitest";
import { buildAgentExecutionSnapshot, buildAgentMessagesWithContext, parseAgentResponse } from "../../src/agent/reactLoop.js";

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
        persistentMemory: "Avoid broad scans.",
        availableSkills: "$frontend-design | Build polished UI | /Users/test/.agents/skills/frontend-design/SKILL.md"
      },
      "Todo state:\n(none)",
      "- Read-only tools: view"
    );

    expect(messages[0]?.content).toContain("Project rules:");
    expect(messages[0]?.content).toContain("Keep diffs small");
    expect(messages[0]?.content).toContain("Persistent memory:");
    expect(messages[0]?.content).toContain("Available skills:");
    expect(messages[0]?.content).toContain("$frontend-design");
    expect(messages[1]?.content).toContain("Session memory summary:");
    expect(messages[1]?.content).toContain("&quot;nextAction&quot;: &quot;Read the entrypoint&quot;");
  });

  it("emits structured todo items in execution snapshots", () => {
    const snapshot = buildAgentExecutionSnapshot(
      "execute",
      {
        items: [
          { id: "todo-1", content: "Refactor UI", status: "in_progress" },
          { id: "todo-2", content: "Run tests", status: "completed" }
        ],
        verification: {
          goal: "Run tests",
          commands: ["npm test"],
          latestCommand: null,
          latestSummary: null,
          status: "pending"
        },
        taskBundle: {
          primaryTask: null,
          subtasks: [],
          results: []
        }
      },
      null,
      null,
      null
    );

    expect(snapshot.todos).toEqual([
      { id: "todo-1", content: "Refactor UI", status: "in_progress" },
      { id: "todo-2", content: "Run tests", status: "completed" }
    ]);
    expect(snapshot.todoCounts).toEqual({
      pending: 0,
      inProgress: 1,
      completed: 1,
      total: 2
    });
    expect(snapshot.todoProgressText).toBe("已完成 1/2 (50%)");
    expect(snapshot.activeTodoId).toBe("todo-1");
  });
});
