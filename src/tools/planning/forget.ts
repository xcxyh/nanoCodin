import { z } from "zod";
import type { Tool } from "../../core/toolTypes.js";

const schema = z.object({
  kind: z.enum(["decision", "pitfall", "preference", "workspace_fact"]),
  content: z.string().min(1)
});

type Input = z.infer<typeof schema>;

export const forgetTool: Tool<Input> = {
  name: "forget",
  description: "Remove a durable memory entry when it is stale, wrong, or no longer useful",
  capabilities: ["mutating", "planning"],
  schema,
  execute: async (input, context) => {
    if (!context.durableMemoryStore) {
      return { ok: false, output: "Durable memory store is unavailable." };
    }

    const before = context.contextSources.durableMemory.entries.length;
    const memory = await context.durableMemoryStore.remove(input.kind, input.content.trim());
    context.contextSources.durableMemory = memory;
    const removed = before - memory.entries.length;

    return {
      ok: true,
      output: [
        `forgot ${input.kind}`,
        `content=${input.content.trim()}`,
        `removed=${Math.max(0, removed)}`,
        `total_entries=${memory.entries.length}`
      ].join("\n")
    };
  }
};
