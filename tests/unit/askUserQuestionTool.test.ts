import { describe, expect, it, vi } from "vitest";
import { askUserQuestionTool } from "../../src/tools/planning/ask_user_question.js";
import { AskUserQuestionController } from "../../src/core/askUserQuestion.js";
import { createToolContext } from "../fixtures/runtime.js";

describe("askUserQuestionTool", () => {
  it("returns an error when AskUserQuestion is unavailable", async () => {
    const result = await askUserQuestionTool.execute({
      title: "Confirm",
      options: [{ value: "yes", label: "Yes" }]
    }, createToolContext());

    expect(result.ok).toBe(false);
    expect(result.output).toContain("unavailable");
  });

  it("asks through the shared controller and returns the selected option", async () => {
    const controller = new AskUserQuestionController();
    const handler = vi.fn(async () => "approve");
    controller.setHandler(handler);

    const result = await askUserQuestionTool.execute({
      title: "Proceed?",
      body: "Pick one option.",
      details: [{ label: "Scope", value: "workspace" }],
      options: [
        { value: "approve", label: "Approve", shortcutKey: "y" },
        { value: "deny", label: "Deny", shortcutKey: "n" }
      ],
      defaultIndex: 0
    }, createToolContext({ askUserQuestion: controller }));

    expect(result.ok).toBe(true);
    expect(result.output).toContain("answer=approve");
    expect(result.output).toContain("label=Approve");
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      title: "Proceed?",
      body: "Pick one option."
    }));
  });

  it("rejects an out-of-range defaultIndex", async () => {
    const controller = new AskUserQuestionController();
    controller.setHandler(async () => "yes");

    const result = await askUserQuestionTool.execute({
      title: "Confirm",
      options: [{ value: "yes", label: "Yes" }],
      defaultIndex: 2
    }, createToolContext({ askUserQuestion: controller }));

    expect(result.ok).toBe(false);
    expect(result.output).toContain("out of range");
  });
});
