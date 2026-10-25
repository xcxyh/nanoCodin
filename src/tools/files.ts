import { mkdir, opendir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ToolExecutionError } from "../core/toolTypes.js";
import { fileHash, MAX_FILE_BYTES, readTextFile, replaceTextFile } from "./fileIO.js";
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
    const entries = [];
    for await (const entry of await opendir(root)) {
      context.signal?.throwIfAborted();
      if (!ignored.has(entry.name)) entries.push(entry);
      if (entries.length > 200) break;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    return { ok: true, output: entries.slice(0, 200).map((entry) => `${entry.isDirectory() ? "dir " : "file"} ${entry.name}`).join("\n") + (entries.length > 200 ? "\n...[listing limited to 200 entries]" : "") };
  }
});

export const view = defineTool({
  name: "view", description: "Read a regular UTF-8 file (at most 8 MiB). Returns SHA-256 for guarded edits. Default 200 lines, at most 400; follow exact startLine/startColumn continuation when output is clipped.",
  schema: z.object({ path: filePath, startLine: z.number().int().positive().optional(), endLine: z.number().int().positive().optional(), startColumn: z.number().int().positive().optional() }),
  async execute(input, context) {
    const file = await readTextFile(path.resolve(context.cwd, input.path), context.signal);
    const lines = file.text.split(/\r?\n/);
    const start = (input.startLine ?? 1) - 1;
    if ((input.endLine && input.endLine < start + 1) || start >= lines.length) throw new ToolExecutionError("INVALID_RANGE", "Line range is outside the file or endLine is before startLine.");
    const end = Math.min(input.endLine ?? start + 200, start + 400, lines.length);
    let output = `Viewing: ${input.path} (${lines.length} lines)\nSHA256: ${file.hash}\nLine ending: ${file.text.includes("\r\n") ? "CRLF" : "LF"}\n`;
    let nextLine = end + 1; let nextColumn = 1;
    for (let i = start; i < end; i++) {
      const column = i === start ? (input.startColumn ?? 1) - 1 : 0;
      if (column > lines[i].length) throw new ToolExecutionError("INVALID_RANGE", "startColumn is outside the requested line.");
      const prefix = `${i + 1}: `;
      const remaining = Math.max(0, 11500 - Buffer.byteLength(output + prefix));
      const bytes = Buffer.from(lines[i].slice(column));
      let count = Math.min(remaining, bytes.length);
      while (count < bytes.length && count > 0 && (bytes[count] & 0xc0) === 0x80) count--;
      const visible = bytes.subarray(0, count).toString("utf8");
      if (remaining < 20) { nextLine = i + 1; nextColumn = column + 1; break; }
      output += `${prefix}${visible}\n`;
      if (count < bytes.length) { nextLine = i + 1; nextColumn = column + visible.length + 1; break; }
    }
    const truncated = nextLine <= lines.length;
    if (truncated) output += `More: use startLine=${nextLine}, startColumn=${nextColumn}. [output bounded]`;
    return { ok: true, output, data: { path: input.path, hash: file.hash, truncated, ...(truncated ? { nextStartLine: nextLine, nextStartColumn: nextColumn } : {}) } };
  }
});

export const create = defineTool({
  name: "create", description: "Create a NEW file only. Existing files must be edited with str_replace; for full rewrite use mode=rewrite and expectedHash from view.", mutates: true,
  schema: z.object({ path: filePath, content: z.string() }),
  async execute(input, context) {
    if (Buffer.byteLength(input.content) > MAX_FILE_BYTES) throw new ToolExecutionError("FILE_TOO_LARGE", "New file exceeds 8 MiB.");
    const target = path.resolve(context.cwd, input.path);
    context.signal?.throwIfAborted();
    await mkdir(path.dirname(target), { recursive: true });
    try { await writeFile(target, input.content, { encoding: "utf8", flag: "wx", signal: context.signal }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new ToolExecutionError("FILE_EXISTS", `File already exists: ${input.path}. No file was overwritten. Use str_replace, or view then str_replace with mode=rewrite and expectedHash.`);
      throw error;
    }
    return { ok: true, output: `Created: ${input.path}\nSHA256: ${fileHash(input.content)}`, effects: { changedFiles: [input.path] }, data: { hash: fileHash(input.content) } };
  }
});

export const strReplace = defineTool({
  name: "str_replace", description: "Edit an EXISTING regular file. Default mode=replace requires a unique exact oldText unless replaceAll=true. Explicit mode=rewrite replaces the whole file and requires expectedHash (SHA256 from view). A stale hash fails without changing the file.", mutates: true,
  schema: z.object({ path: filePath, mode: z.enum(["replace", "rewrite"]).optional(), oldText: z.string().min(1).optional(), newText: z.string(), replaceAll: z.boolean().optional(), expectedHash: z.string().regex(/^[a-f0-9]{64}$/).optional() }).superRefine((input, ctx) => {
    if (input.mode === "rewrite" && !input.expectedHash) ctx.addIssue({ code: "custom", path: ["expectedHash"], message: "rewrite requires expectedHash from view" });
    if (input.mode !== "rewrite" && !input.oldText) ctx.addIssue({ code: "custom", path: ["oldText"], message: "replace requires oldText" });
  }),
  async execute(input, context) {
    const target = path.resolve(context.cwd, input.path);
    const original = await readTextFile(target, context.signal);
    if (input.expectedHash && input.expectedHash !== original.hash) throw new ToolExecutionError("VERSION_CONFLICT", "File changed since view. Read its current hash before editing.");
    let text = input.newText; let count = 1;
    if (input.mode !== "rewrite") {
      count = original.text.split(input.oldText!).length - 1;
      if (!count) throw new ToolExecutionError("NO_MATCH", "No exact match. Read the relevant lines; respect the file's line endings and exact text.");
      if (count > 1 && !input.replaceAll) throw new ToolExecutionError("MULTIPLE_MATCHES", `${count} matches. Include more context or explicitly set replaceAll=true.`);
      text = original.text.split(input.oldText!).join(input.newText);
    }
    if (text === original.text) return { ok: true, output: "No change: replacement equals current content.", effects: { changed: false } };
    await replaceTextFile(target, original, text, context.signal);
    return { ok: true, output: `Replaced ${count} occurrence(s): ${input.path}\nSHA256: ${fileHash(text)}`, effects: { changedFiles: [input.path] }, data: { hash: fileHash(text) } };
  }
});

export const grep = defineTool({
  name: "grep", description: "Search literal text in a file or directory. Skips generated directories, binary files and files over 1 MiB. At most 1000 files, 200 hits.",
  schema: z.object({ pattern: z.string().min(1), path: filePath.optional(), fileExtension: z.string().optional(), maxResults: z.number().int().min(1).max(200).optional() }),
  async execute(input, context) {
    const files: string[] = []; const reasons = new Set<string>();
    let directories = 0; let entries = 0;
    const deadline = Date.now() + 5000;
    const walk = async (target: string, depth = 0): Promise<void> => {
      context.signal?.throwIfAborted();
      if (files.length >= 1000) { reasons.add("1000 candidate files"); return; }
      if (Date.now() > deadline || depth > 64 || directories >= 2000 || entries >= 10000) { reasons.add("traversal/time limit"); return; }
      const info = await stat(target);
      if (info.isFile()) {
        if (input.fileExtension && !target.endsWith(input.fileExtension)) return;
        if (info.size <= 1024 * 1024) files.push(target); else reasons.add("oversized files skipped");
        return;
      }
      if (!info.isDirectory()) return;
      directories++;
      for await (const entry of await opendir(target)) {
        entries++;
        if (ignored.has(entry.name) || entry.isSymbolicLink()) continue;
        if (entry.isFile() && input.fileExtension && !entry.name.endsWith(input.fileExtension)) continue;
        try { await walk(path.join(target, entry.name), depth + 1); }
        catch (error) { if (context.signal?.aborted) throw error; reasons.add("unreadable paths skipped"); }
        if (files.length >= 1000 || entries >= 10000 || Date.now() > deadline) { reasons.add("search limit reached"); break; }
      }
    };
    await walk(path.resolve(context.cwd, input.path ?? "."));
    const hits: string[] = []; let searched = 0;
    const limit = input.maxResults ?? 50;
    for (const file of files) {
      context.signal?.throwIfAborted();
      if (Date.now() > deadline) { reasons.add("time limit"); break; }
      let text: string;
      try { text = (await readTextFile(file, context.signal, 1024 * 1024)).text; }
      catch (error) { if (context.signal?.aborted) throw error; if (!(error instanceof ToolExecutionError && error.code === "UNSUPPORTED_FILE")) reasons.add("unreadable files skipped"); continue; }
      searched++;
      for (const [index, line] of text.split(/\r?\n/).entries()) {
        if (line.includes(input.pattern)) hits.push(`${path.relative(context.cwd, file)}:${index + 1}: ${line.trim()}`);
        if (hits.length >= limit) break;
      }
      if (hits.length >= limit) { reasons.add("result limit"); break; }
    }
    return { ok: true, output: clip(`${hits.join("\n") || "No matches found."}${reasons.size ? `\n...[partial search: ${[...reasons].join(", ")}; narrow path or pattern]` : ""}`), data: { searchedFiles: searched, partial: reasons.size > 0, reasons: [...reasons] } };
  }
});

export const fileTools = [ls, grep, view, create, strReplace];
