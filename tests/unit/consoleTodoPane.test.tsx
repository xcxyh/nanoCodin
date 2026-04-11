import React from "react";
import { describe, expect, it } from "vitest";
import { ConsoleTodoPane } from "../../src/ui/components/ConsoleTodoPane.js";

function collectText(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") {
    return "";
  }
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map((child) => collectText(child)).join("");
  }
  if (React.isValidElement(node)) {
    return collectText(node.props.children);
  }
  return "";
}

describe("ConsoleTodoPane", () => {
  it("returns null when hidden or empty", () => {
    expect(ConsoleTodoPane({ snapshot: null, visible: true })).toBeNull();
    expect(ConsoleTodoPane({
      snapshot: {
        phase: "plan",
        todos: [],
        todoCounts: { pending: 0, inProgress: 0, completed: 0, total: 0 },
        todoProgressText: "已完成 0/0 (0%)",
        activeTodoId: null,
        verificationGoal: "",
        verificationCommands: [],
        verificationStatus: "pending",
        latestVerification: null,
        tokenUsage: null,
        subtaskSummaries: [],
        sessionNextAction: null,
        touchedFiles: []
      },
      visible: true
    })).toBeNull();
  });

  it("renders todo progress and status summary in the title", () => {
    const element = ConsoleTodoPane({
      snapshot: {
        phase: "execute",
        todos: [
          { id: "todo-1", content: "重构 UI", status: "pending" },
          { id: "todo-2", content: "跑测试", status: "in_progress" },
          { id: "todo-3", content: "收尾", status: "completed" }
        ],
        todoCounts: { pending: 1, inProgress: 1, completed: 1, total: 3 },
        todoProgressText: "已完成 1/3 (33%)",
        activeTodoId: "todo-2",
        verificationGoal: "Run tests",
        verificationCommands: ["npm run test"],
        verificationStatus: "pending",
        latestVerification: null,
        tokenUsage: null,
        subtaskSummaries: [],
        sessionNextAction: null,
        touchedFiles: []
      },
      visible: true
    });

    const text = collectText(element);

    expect(text).toContain("Tasks");
    expect(text).toContain("已完成 1/3 (33%)");
    expect(text).toContain("○ 1");
    expect(text).toContain("◐ 1");
    expect(text).toContain("● 1");
    expect(text).toContain("◐ 跑测试 (进行中)");
    expect(text).not.toContain("验证:");
  });
});
