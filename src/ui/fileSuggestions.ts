import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const ignored = new Set([".git", "node_modules", "dist", ".next", "coverage", "build"]);
const MAX_FILES = 2000;

/** UI-only, on-demand file discovery. Git respects ignore rules; non-Git workspaces use a bounded walk. */
export async function loadFileSuggestions(cwd: string, signal?: AbortSignal): Promise<string[]> {
  signal?.throwIfAborted();
  try {
    const { stdout } = await execute("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
      cwd, signal, timeout: 3000, maxBuffer: 512 * 1024, encoding: "utf8"
    });
    return [...new Set(stdout.split("\0").filter((file) => file && !file.split("/").some((part) => ignored.has(part))))].sort().slice(0, MAX_FILES);
  } catch {
    signal?.throwIfAborted();
  }
  const files: string[] = [];
  const deadline = Date.now() + 3000;
  const walk = async (directory: string): Promise<void> => {
    signal?.throwIfAborted();
    if (files.length >= MAX_FILES || Date.now() >= deadline) return;
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      signal?.throwIfAborted();
      if (files.length >= MAX_FILES || Date.now() >= deadline) break;
      if (ignored.has(entry.name) || entry.isSymbolicLink()) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) files.push(path.relative(cwd, absolute));
    }
  };
  await walk(cwd);
  return files.sort();
}
