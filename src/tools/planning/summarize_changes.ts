import { z } from "zod";
import type { Tool } from "../../core/toolTypes.js";
import { buildFinalSummary } from "../../services/executionSummary.js";

const schema = z.object({
  latestVerification: z.string().optional()
});

type Input = z.infer<typeof schema>;

export const summarizeChangesTool: Tool<Input> = {
  name: "summarize_changes",
  description: "Summarize touched files, completed todos, verification, and subtask outcomes",
  capabilities: ["summary"],
  schema,
  execute: async (input, context) => {
    const summary = buildFinalSummary({
      workingMemory: context.workingMemory,
      todos: context.todos,
      subtasks: context.todos.taskBundle.results,
      latestVerification: input.latestVerification ?? null
    });

    const commandTail = context.commandLogs.slice(-3).map((log) => {
      const status = log.ok ? "ok" : "error";
      return `${status} ${log.command}`;
    });

    return {
      ok: true,
      output: [
        summary,
        `Recent commands: ${commandTail.length > 0 ? commandTail.join(" | ") : "(none)"}`
      ].join("\n")
    };
  }
};
