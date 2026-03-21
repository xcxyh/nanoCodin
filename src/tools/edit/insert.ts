import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Tool } from "../../core/toolTypes.js";

const schema = z.object({
  path: z.string(),
  line: z.number().int().min(1),
  text: z.string()
});

type Input = z.infer<typeof schema>;

export const insertTool: Tool<Input> = {
  name: "insert",
  description: "Insert text before a line number",
  capabilities: ["mutating"],
  schema,
  execute: async (input, context) => {
    const target = path.resolve(context.cwd, input.path);
    const content = await readFile(target, "utf8");
    const lines = content.split(/\r?\n/);

    const index = Math.min(input.line - 1, lines.length);
    lines.splice(index, 0, input.text);

    await writeFile(target, lines.join("\n"), "utf8");
    return { ok: true, output: `Inserted text at line ${input.line} in ${input.path}` };
  }
};
