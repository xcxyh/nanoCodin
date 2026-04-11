import { describe, expect, it } from "vitest";
import { buildPermissionQuestion } from "../../src/core/permission.js";

describe("buildPermissionQuestion", () => {
  it("builds a permission question for bash commands", () => {
    const question = buildPermissionQuestion({
      toolName: "bash",
      input: { command: "echo test" },
      reason: "This shell command needs approval before it can run."
    });

    expect(question.title).toBe("Permission required");
    expect(question.body).toContain("approval");
    expect(question.details).toEqual([
      { label: "Tool", value: "bash" },
      { label: "Command", value: "echo test" }
    ]);
    expect(question.options.map((option) => option.value)).toEqual(["allow_once", "allow_all", "deny"]);
    expect(question.options.map((option) => option.shortcutKey)).toEqual(["y", "a", "n"]);
    expect(question.defaultIndex).toBe(0);
  });
});
