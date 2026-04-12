import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Tool } from "../../core/toolTypes.js";

const schema = z.object({
  path: z.string().optional(),
  startLine: z.number().int().min(1).optional(),
  endLine: z.number().int().min(1).optional()
});

type Input = z.infer<typeof schema>;

export const viewTool: Tool<Input> = {
  name: "view",
  description: "View file content with optional line range; if path is omitted, reuse the most recent touched file when available",
  capabilities: ["read_only"],
  schema,
  execute: async (input, context) => {
    const fallbackPath = context.workingMemory?.touchedFiles.at(-1);
    const selectedPath = input.path ?? fallbackPath;

    if (!selectedPath) {
      return {
        ok: true,
        output: "No file path provided. Use ls, tree, grep, or repo_index_query to find a file, or retry view with a path."
      };
    }

    const target = path.resolve(context.cwd, selectedPath);
    const content = await readFile(target, "utf8");
    const lines = content.split(/\r?\n/);
    const start = input.startLine ? input.startLine - 1 : 0;
    const end = input.endLine ? input.endLine : lines.length;

    if (start < 0 || end < start) {
      return { ok: false, output: "Invalid line range." };
    }

    const selected = lines.slice(start, end);
    const numbered = selected.map((line, idx) => `${start + idx + 1}: ${line}`);

    return {
      ok: true,
      output: [`Viewing: ${selectedPath}`, numbered.join("\n")].filter(Boolean).join("\n")
    };
  }
};
