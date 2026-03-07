import { readdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Tool } from "../../core/toolTypes.js";

const schema = z.object({
  path: z.string().optional(),
  maxDepth: z.number().int().min(1).max(8).optional()
});

type Input = z.infer<typeof schema>;

const IGNORED = new Set([".git", "node_modules", "dist"]);

async function walk(dir: string, depth: number, maxDepth: number, prefix: string): Promise<string[]> {
  if (depth > maxDepth) {
    return [];
  }

  const entries = await readdir(dir, { withFileTypes: true });
  const visible = entries
    .filter((entry) => !IGNORED.has(entry.name))
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));

  const lines: string[] = [];

  for (let i = 0; i < visible.length; i += 1) {
    const entry = visible[i];
    const last = i === visible.length - 1;
    const connector = last ? "└─" : "├─";
    const line = `${prefix}${connector} ${entry.name}${entry.isDirectory() ? "/" : ""}`;
    lines.push(line);

    if (entry.isDirectory() && depth < maxDepth) {
      const childPrefix = `${prefix}${last ? "   " : "│  "}`;
      const childLines = await walk(path.join(dir, entry.name), depth + 1, maxDepth, childPrefix);
      lines.push(...childLines);
    }
  }

  return lines;
}

export const treeTool: Tool<Input> = {
  name: "tree",
  description: "Display a recursive directory tree",
  schema,
  execute: async (input, context) => {
    const target = path.resolve(context.cwd, input.path ?? ".");
    const maxDepth = input.maxDepth ?? 3;
    const lines = await walk(target, 1, maxDepth, "");

    return {
      ok: true,
      output: [target, ...lines].join("\n")
    };
  }
};
