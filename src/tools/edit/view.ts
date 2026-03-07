import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Tool } from "../../core/toolTypes.js";

const schema = z.object({
  path: z.string(),
  startLine: z.number().int().min(1).optional(),
  endLine: z.number().int().min(1).optional()
});

type Input = z.infer<typeof schema>;

export const viewTool: Tool<Input> = {
  name: "view",
  description: "View file content with optional line range",
  schema,
  execute: async (input, context) => {
    const target = path.resolve(context.cwd, input.path);
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
      output: numbered.join("\n")
    };
  }
};
