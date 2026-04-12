import { z } from "zod";
import type { Tool } from "../../core/toolTypes.js";
import { createDurableMemoryEntry } from "../../services/memoryManager.js";

const schema = z.object({
  kind: z.enum(["decision", "pitfall", "preference", "workspace_fact"]),
  content: z.string().min(1),
  tags: z.array(z.string().min(1)).max(8).optional()
});

type Input = z.infer<typeof schema>;

export const rememberTool: Tool<Input> = {
  name: "remember",
  description: "Persist a durable memory entry for future runs when you discover a stable decision, preference, pitfall, or workspace fact",
  capabilities: ["mutating", "planning"],
  schema,
  execute: async (input, context) => {
    if (!context.durableMemoryStore) {
      return { ok: false, output: "Durable memory store is unavailable." };
    }

    const memory = await context.durableMemoryStore.upsert(
      createDurableMemoryEntry(input.kind, input.content.trim(), input.tags ?? [])
    );
    context.contextSources.durableMemory = memory;

    const matched = memory.entries.find((entry) => entry.kind === input.kind && entry.content === input.content.trim());
    return {
      ok: true,
      output: [
        `remembered ${input.kind}`,
        `content=${input.content.trim()}`,
        `tags=${matched?.tags.join(", ") || "(none)"}`,
        `total_entries=${memory.entries.length}`
      ].join("\n")
    };
  }
};
