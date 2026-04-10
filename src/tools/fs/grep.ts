import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Tool } from "../../core/toolTypes.js";

const schema = z.object({
  pattern: z.string().min(1),
  path: z.string().optional(),
  fileExtension: z.string().optional(),
  maxResults: z.number().int().min(1).max(200).optional()
});

type Input = z.infer<typeof schema>;

const IGNORED = new Set([".git", "node_modules", "dist"]);

interface Hit {
  file: string;
  line: number;
  content: string;
}

export async function collectFiles(root: string, maxFiles = 1000): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    // 权限错误或其他读取错误，跳过此目录
    return [];
  }

  const files: string[] = [];

  for (const entry of entries) {
    if (files.length >= maxFiles) {
      break;
    }

    if (IGNORED.has(entry.name)) {
      continue;
    }

    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      try {
        const subFiles = await collectFiles(full, maxFiles - files.length);
        files.push(...subFiles);
      } catch {
        // 权限错误或其他读取错误，跳过此子目录
        continue;
      }
    } else if (entry.isFile()) {
      files.push(full);
    }
  }

  return files;
}

export const grepTool: Tool<Input> = {
  name: "grep",
  description: "Search for text across files",
  capabilities: ["read_only"],
  schema,
  execute: async (input, context) => {
    const root = path.resolve(context.cwd, input.path ?? ".");
    const maxResults = input.maxResults ?? 50;
    const files = await collectFiles(root);
    const matchedFiles = input.fileExtension
      ? files.filter((f) => f.endsWith(input.fileExtension ?? ""))
      : files;

    const hits: Hit[] = [];
    for (const file of matchedFiles) {
      if (hits.length >= maxResults) {
        break;
      }

      let text: string;
      try {
        text = await readFile(file, "utf8");
      } catch {
        continue;
      }

      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i += 1) {
        if (lines[i].includes(input.pattern)) {
          hits.push({ file: path.relative(context.cwd, file), line: i + 1, content: lines[i].trim() });
          if (hits.length >= maxResults) {
            break;
          }
        }
      }
    }

    if (hits.length === 0) {
      return { ok: true, output: "No matches found." };
    }

    return {
      ok: true,
      output: hits.map((h) => `${h.file}:${h.line}: ${h.content}`).join("\n")
    };
  }
};
