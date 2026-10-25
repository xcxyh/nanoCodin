import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { defineTool } from "./define.js";

const ignored = new Set([".git", "node_modules", "dist", ".next", "coverage", "build"]);
const filePath = z.string().min(1);
export function clip(text: string, limit = 12_000): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}\n...[truncated; narrow the query or read another line range]`;
}

export const ls = defineTool({
  name: "ls", description: "List files in a directory. Use paths to narrow subsequent reads or searches.",
  schema: z.object({ path: filePath.optional() }),
  async execute(input, context) {
    const root = path.resolve(context.cwd, input.path ?? ".");
    const entries = (await readdir(root, { withFileTypes: true })).filter((entry) => !ignored.has(entry.name));
    entries.sort((a, b) => a.name.localeCompare(b.name));
    return { ok: true, output: entries.slice(0, 200).map((entry) => `${entry.isDirectory() ? "dir " : "file"} ${entry.name}`).join("\n") + (entries.length > 200 ? "\n...[listing limited to 200 entries]" : "") };
  }
});

export const view = defineTool({
  name: "view", description: "Read a file with line numbers. path required; default 200 lines, at most 400. Use ranges for large files.",
  schema: z.object({ path: filePath, startLine: z.number().int().positive().optional(), endLine: z.number().int().positive().optional() }),
  async execute(input, context) {
    const lines = (await readFile(path.resolve(context.cwd, input.path), "utf8")).split(/\r?\n/);
    const start = (input.startLine ?? 1) - 1;
    if (input.endLine && input.endLine < start + 1) return { ok: false, output: "endLine must be >= startLine." };
    const end = Math.min(input.endLine ?? start + 200, start + 400, lines.length);
    return { ok: true, output: clip(`Viewing: ${input.path} (${lines.length} lines)\n${lines.slice(start, end).map((line, i) => `${start + i + 1}: ${line}`).join("\n")}${end < lines.length ? `\nMore: use startLine=${end + 1}.` : ""}`) };
  }
});

export const create = defineTool({
  name: "create", description: "Create a new file. Fails if it already exists.", mutates: true,
  schema: z.object({ path: filePath, content: z.string() }),
  async execute(input, context) {
    const target = path.resolve(context.cwd, input.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, input.content, { encoding: "utf8", flag: "wx" });
    return { ok: true, output: `Created: ${input.path}`, effects: { changedFiles: [input.path] } };
  }
});

export const strReplace = defineTool({
  name: "str_replace", description: "Replace exact text. oldText must match once unless replaceAll is explicitly true.", mutates: true,
  schema: z.object({ path: filePath, oldText: z.string().min(1), newText: z.string(), replaceAll: z.boolean().optional() }),
  async execute(input, context) {
    const target = path.resolve(context.cwd, input.path);
    const original = await readFile(target, "utf8");
    const count = original.split(input.oldText).length - 1;
    if (!count) return { ok: false, output: "No exact match. Read the relevant lines and retry with their exact text." };
    if (count > 1 && !input.replaceAll) return { ok: false, output: `${count} matches. Include more surrounding context or set replaceAll=true intentionally.` };
    if (input.oldText === input.newText) return { ok: true, output: "No change: oldText equals newText." };
    await writeFile(target, original.split(input.oldText).join(input.newText), "utf8");
    return { ok: true, output: `Replaced ${count} occurrence(s): ${input.path}`, effects: { changedFiles: [input.path] } };
  }
});

export const grep = defineTool({
  name: "grep", description: "Search literal text in a file or directory. Skips generated directories, binary files and files over 1 MiB. At most 1000 files, 200 hits.",
  schema: z.object({ pattern: z.string().min(1), path: filePath.optional(), fileExtension: z.string().optional(), maxResults: z.number().int().min(1).max(200).optional() }),
  async execute(input, context) {
    const files: string[] = [];
    const walk = async (target: string): Promise<void> => {
      context.signal?.throwIfAborted();
      if (files.length >= 1000) return;
      const info = await stat(target);
      if (info.isFile()) { if (info.size <= 1024 * 1024) files.push(target); return; }
      if (!info.isDirectory()) return;
      for (const entry of await readdir(target, { withFileTypes: true })) {
        if (ignored.has(entry.name) || entry.isSymbolicLink()) continue;
        await walk(path.join(target, entry.name));
        if (files.length >= 1000) break;
      }
    };
    await walk(path.resolve(context.cwd, input.path ?? "."));
    const hits: string[] = [];
    const limit = input.maxResults ?? 50;
    for (const file of files) {
      context.signal?.throwIfAborted();
      if (input.fileExtension && !file.endsWith(input.fileExtension)) continue;
      const text = await readFile(file, "utf8").catch(() => "");
      if (text.includes("\0")) continue;
      for (const [index, line] of text.split(/\r?\n/).entries()) {
        if (line.includes(input.pattern)) hits.push(`${path.relative(context.cwd, file)}:${index + 1}: ${line.trim()}`);
        if (hits.length >= limit) break;
      }
      if (hits.length >= limit) break;
    }
    return { ok: true, output: clip(`${hits.join("\n") || "No matches found."}${files.length >= 1000 || hits.length >= limit ? "\n...[search limit reached; narrow path or pattern]" : ""}`) };
  }
});

export const fileTools = [ls, grep, view, create, strReplace];
