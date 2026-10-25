import { z } from "zod";
import { defineTool } from "./define.js";

export const todo = defineTool({
  name: "todo", description: "Optionally replace the short plan for a multi-step task. Never required before edits.",
  schema: z.object({ items: z.array(z.object({ text: z.string().min(1), status: z.enum(["pending", "in_progress", "completed"]) })).max(10), verificationCommands: z.array(z.string().min(1)).optional() }),
  async execute(input) {
    return { ok: true, output: input.items.map((item: { text: string; status: string }) => `${item.status}: ${item.text}`).join("\n"), effects: { plan: input.items, verificationCommands: input.verificationCommands } };
  }
});

export const askUserQuestion = defineTool({
  name: "ask_user_question", description: "Ask for missing information needed to continue. Wait for the user's choice.",
  schema: z.object({ title: z.string().min(1), body: z.string().optional(), options: z.array(z.object({ value: z.string().min(1), label: z.string().min(1), shortcutKey: z.string().length(1).optional() })).min(1) }),
  async execute(input, context) {
    if (!context.ask) return { ok: false, output: "User input is unavailable in this runtime. Explain the missing information in an incomplete final answer." };
    const answer = await context.ask(input, context.signal);
    return { ok: true, output: `User selected: ${answer}` };
  }
});
