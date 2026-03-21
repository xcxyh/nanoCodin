import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Tool } from "../../core/toolTypes.js";

const schema = z.object({
  path: z.string(),
  oldText: z.string(),
  newText: z.string()
});

type Input = z.infer<typeof schema>;

export const strReplaceTool: Tool<Input> = {
  name: "str_replace",
  description: "Replace exact text in a file",
  capabilities: ["mutating"],
  schema,
  execute: async (input, context) => {
    if (input.oldText.length === 0) {
      return { ok: false, output: "oldText cannot be empty." };
    }

    const target = path.resolve(context.cwd, input.path);
    const original = await readFile(target, "utf8");
    const occurrences = original.split(input.oldText).length - 1;

    if (occurrences === 0) {
      return { ok: false, output: "No occurrences found." };
    }

    const updated = original.split(input.oldText).join(input.newText);
    await writeFile(target, updated, "utf8");

    return { ok: true, output: `Replaced ${occurrences} occurrence(s) in ${input.path}` };
  }
};
