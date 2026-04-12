import { z } from "zod";
import type { Tool } from "../../core/toolTypes.js";

const schema = z.object({
  source: z.enum(["project_rules", "project_context", "persistent_memory", "durable_memory"]),
  startLine: z.number().int().min(1).optional(),
  endLine: z.number().int().min(1).optional()
});

type Input = z.infer<typeof schema>;

function toLines(input: string): string[] {
  return input.split(/\r?\n/);
}

export const readContextTool: Tool<Input> = {
  name: "read_context",
  description: "Read layered project context such as AGENTS rules, context.md, or memory.md",
  capabilities: ["read_only"],
  schema,
  execute: async (input, context) => {
    const raw = input.source === "project_rules"
      ? context.contextSources.projectRules.join("\n")
      : input.source === "project_context"
        ? (context.contextSources.projectContext ?? "")
        : input.source === "persistent_memory"
          ? (context.contextSources.durableMemory.legacyText ?? "")
          : context.contextSources.durableMemory.entries
            .map((entry) => `${entry.kind}: ${entry.content}${entry.tags.length > 0 ? ` [${entry.tags.join(", ")}]` : ""}`)
            .join("\n");

    if (!raw.trim()) {
      return { ok: true, output: `No content available for ${input.source}.` };
    }

    const lines = toLines(raw);
    const start = input.startLine ? input.startLine - 1 : 0;
    const end = input.endLine ? input.endLine : lines.length;
    if (start < 0 || end < start) {
      return { ok: false, output: "Invalid line range." };
    }

    const numbered = lines.slice(start, end).map((line, idx) => `${start + idx + 1}: ${line}`);
    const hint = input.source === "project_rules"
      ? "Use this for hard constraints and collaboration rules."
      : input.source === "project_context"
        ? "Use this for repo architecture and operating conventions."
        : input.source === "persistent_memory"
          ? "Use this for legacy imported memory text."
          : "Use this for durable lessons, user preferences, and workspace facts.";
    return {
      ok: true,
      output: [`source=${input.source}`, `hint=${hint}`, ...numbered].join("\n")
    };
  }
};
