import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Tool } from "../../core/toolTypes.js";

const schema = z.object({
  path: z.string(),
  content: z.string()
});

type Input = z.infer<typeof schema>;

export const createTool: Tool<Input> = {
  name: "create",
  description: "Create a new file. Fails if file already exists",
  schema,
  execute: async (input, context) => {
    const target = path.resolve(context.cwd, input.path);
    if (existsSync(target)) {
      return { ok: false, output: `File already exists: ${input.path}` };
    }

    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, input.content, "utf8");
    return { ok: true, output: `Created file: ${input.path}` };
  }
};
