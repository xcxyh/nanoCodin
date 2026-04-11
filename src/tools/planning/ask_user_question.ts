import { z } from "zod";
import type { Tool } from "../../core/toolTypes.js";

const optionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
  shortcutKey: z.string().min(1).max(1).optional()
});

const detailSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1)
});

const schema = z.object({
  title: z.string().min(1),
  body: z.string().optional(),
  details: z.array(detailSchema).optional(),
  options: z.array(optionSchema).min(1),
  defaultIndex: z.number().int().min(0).optional()
});

type Input = z.infer<typeof schema>;

function renderQuestionSummary(input: Input, answer: string): string {
  const selected = input.options.find((option) => option.value === answer);
  return [
    `title=${input.title}`,
    `answer=${answer}`,
    `label=${selected?.label ?? "(unknown)"}`,
    `shortcut=${selected?.shortcutKey ?? "(none)"}`
  ].join("\n");
}

export const askUserQuestionTool: Tool<Input> = {
  name: "ask_user_question",
  description: "Ask the user a multiple-choice question and wait for a selection",
  capabilities: ["planning"],
  schema,
  execute: async (input, context) => {
    if (!context.askUserQuestion) {
      return { ok: false, output: "AskUserQuestion is unavailable in this runtime." };
    }

    if (typeof input.defaultIndex === "number" && input.defaultIndex >= input.options.length) {
      return { ok: false, output: `defaultIndex ${input.defaultIndex} is out of range for ${input.options.length} options.` };
    }

    const answer = await context.askUserQuestion.ask(input);
    return {
      ok: true,
      output: renderQuestionSummary(input, answer)
    };
  }
};
