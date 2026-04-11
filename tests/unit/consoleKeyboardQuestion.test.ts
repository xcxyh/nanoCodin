import { describe, expect, it } from "vitest";
import { getSelectedQuestionOption, resolveQuestionShortcut } from "../../src/ui/hooks/useConsoleKeyboard.js";

describe("resolveQuestionShortcut", () => {
  it("returns the matching option value", () => {
    const value = resolveQuestionShortcut({
      request: {
        title: "Permission required",
        options: [
          { value: "allow_once", label: "Allow once", shortcutKey: "y" },
          { value: "deny", label: "Deny", shortcutKey: "n" }
        ]
      },
      selectedIndex: 0,
      resolve: () => undefined
    }, "n");

    expect(value).toBe("deny");
  });

  it("returns null for non-matching keys", () => {
    const value = resolveQuestionShortcut({
      request: {
        title: "Permission required",
        options: [
          { value: "allow_once", label: "Allow once", shortcutKey: "y" }
        ]
      },
      selectedIndex: 0,
      resolve: () => undefined
    }, "x");

    expect(value).toBeNull();
  });
});

describe("getSelectedQuestionOption", () => {
  it("returns the clamped selected option", () => {
    const option = getSelectedQuestionOption([
      { value: "allow_once", label: "Allow once" },
      { value: "allow_all", label: "Allow for session" },
      { value: "deny", label: "Deny" }
    ], 99);

    expect(option?.value).toBe("deny");
  });
});
