import React from "react";
import { describe, expect, it } from "vitest";
import { AskUserQuestionBox } from "../../src/ui/components/AskUserQuestionBox.js";

function collectText(node: unknown): string[] {
  if (node == null || typeof node === "boolean") {
    return [];
  }
  if (typeof node === "string" || typeof node === "number") {
    return [String(node)];
  }
  if (Array.isArray(node)) {
    return node.flatMap(collectText);
  }
  if (typeof node === "object" && "props" in node) {
    return collectText((node as { props: { children?: unknown } }).props.children);
  }
  return [];
}

function findHighlightedRows(node: unknown): Array<{ text: string; backgroundColor?: string }> {
  if (node == null || typeof node === "boolean") {
    return [];
  }
  if (Array.isArray(node)) {
    return node.flatMap(findHighlightedRows);
  }
  if (typeof node === "object" && "props" in node) {
    const element = node as { props: { children?: unknown; backgroundColor?: string } };
    const children = findHighlightedRows(element.props.children);
    const text = collectText(element.props.children).join("");
    if (text) {
      return [{ text, backgroundColor: element.props.backgroundColor }, ...children];
    }
    return children;
  }
  return [];
}

describe("AskUserQuestionBox", () => {
  it("renders question details and highlights the selected option", () => {
    const element = AskUserQuestionBox({
      request: {
        title: "Permission required",
        body: "This shell command needs approval before it can run.",
        details: [
          { label: "Tool", value: "bash" },
          { label: "Command", value: "echo test" }
        ],
        options: [
          { value: "allow_once", label: "Allow once", shortcutKey: "y" },
          { value: "allow_all", label: "Allow for session", shortcutKey: "a" },
          { value: "deny", label: "Deny", shortcutKey: "n" }
        ]
      },
      selectedIndex: 1
    });

    const text = collectText(element).join(" ");
    const rows = findHighlightedRows(element);

    expect(text).toContain("Permission required");
    expect(text).toContain("Tool: bash");
    expect(text).toContain("Command: echo test");
    expect(text).toContain("Allow once [y]");
    expect(text).toContain("Allow for session [a]");
    expect(rows.some((row) => row.text.includes("> Allow for session [a]") && row.backgroundColor === "yellow")).toBe(true);
  });
});
