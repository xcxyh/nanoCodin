import { describe, expect, it } from "vitest";
import {
  AskUserQuestionController,
  clampQuestionSelectionIndex,
  findQuestionOptionByShortcut
} from "../../src/core/askUserQuestion.js";

describe("AskUserQuestionController", () => {
  it("throws when asking without a handler", async () => {
    const controller = new AskUserQuestionController();

    await expect(controller.ask({
      title: "Confirm",
      options: [{ value: "yes", label: "Yes" }]
    })).rejects.toThrow("handler is not set");
  });
});

describe("clampQuestionSelectionIndex", () => {
  it("clamps selection into the available range", () => {
    expect(clampQuestionSelectionIndex(-1, 3)).toBe(0);
    expect(clampQuestionSelectionIndex(2, 3)).toBe(2);
    expect(clampQuestionSelectionIndex(10, 3)).toBe(2);
  });
});

describe("findQuestionOptionByShortcut", () => {
  it("matches shortcut keys case-insensitively", () => {
    const option = findQuestionOptionByShortcut([
      { value: "allow_once", label: "Allow once", shortcutKey: "y" },
      { value: "deny", label: "Deny", shortcutKey: "n" }
    ], "Y");

    expect(option?.value).toBe("allow_once");
  });

  it("returns null when no shortcut matches", () => {
    const option = findQuestionOptionByShortcut([
      { value: "allow_once", label: "Allow once", shortcutKey: "y" }
    ], "x");

    expect(option).toBeNull();
  });
});
