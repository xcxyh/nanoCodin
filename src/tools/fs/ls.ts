import { readdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Tool } from "../../core/toolTypes.js";

const schema = z.object({
  path: z.string().optional()
});

type Input = z.infer<typeof schema>;

export const lsTool: Tool<Input> = {
  name: "ls",
  description: "List files and directories in a path",
  capabilities: ["read_only"],
  schema,
  execute: async (input, context) => {
    const target = path.resolve(context.cwd, input.path ?? ".");
    const entries = await readdir(target, { withFileTypes: true });
    const lines = entries
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((entry) => `${entry.isDirectory() ? "[D]" : "[F]"} ${entry.name}`);

    return {
      ok: true,
      output: lines.length > 0 ? lines.join("\n") : "(empty directory)"
    };
  }
};
