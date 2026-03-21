import { z } from "zod";
import type { Tool } from "../../core/toolTypes.js";

const schema = z.object({
  task: z.string().min(1),
  maxSteps: z.number().int().min(1).max(8).optional()
});

type Input = z.infer<typeof schema>;

export const delegateTool: Tool<Input> = {
  name: "delegate",
  description: "Run a bounded research subtask and return only a structured summary",
  capabilities: ["read_only", "delegation"],
  schema,
  execute: async (input, context) => {
    if (!context.runSubtask) {
      return { ok: false, output: "Subtask delegation is unavailable in this runtime." };
    }
    if ((context.delegationDepth ?? 0) >= 1) {
      return { ok: false, output: "Nested delegation is not allowed." };
    }

    const result = await context.runSubtask(input);
    context.todos.taskBundle.subtasks.push(input.task);
    context.todos.taskBundle.results.push(result);

    return {
      ok: result.status === "success" || result.status === "no_conclusion",
      output: [
        `task=${result.task}`,
        `status=${result.status}`,
        `summary=${result.summary}`,
        `evidence=${result.evidence.join(" | ") || "(none)"}`,
        `touched_files=${result.touchedFiles.join(", ") || "(none)"}`,
        `next=${result.nextActionSuggestion}`
      ].join("\n")
    };
  }
};
