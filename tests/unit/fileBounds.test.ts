import { mkdtemp, writeFile, readFile, mkdir, symlink, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { ToolRegistry } from "../../src/tools/registry.js";
import { fileTools } from "../../src/tools/files.js";
import { MAX_FILE_BYTES } from "../../src/tools/fileIO.js";
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });
async function fixture() { const cwd = await mkdtemp(path.join(os.tmpdir(), "nanocodin-file-bounds-")); dirs.push(cwd); return { cwd, tools: new ToolRegistry(fileTools) }; }
it("continues a long line without losing the next requested line and rejects oversized/binary reads", async () => {
  const { cwd, tools } = await fixture(); await writeFile(path.join(cwd, "long.txt"), "x".repeat(20000) + "\nTAIL\n");
  const first = await tools.execute("view", { path: "long.txt", startLine: 1, endLine: 2 }, { cwd });
  expect(Buffer.byteLength(first.output)).toBeLessThan(12000); expect(first.data).toMatchObject({ truncated: true, nextStartLine: 1 });
  const next = await tools.execute("view", { path: "long.txt", startLine: first.data!.nextStartLine, startColumn: first.data!.nextStartColumn, endLine: 2 }, { cwd });
  expect(next.output).toContain("2: TAIL");
  await writeFile(path.join(cwd, "large.txt"), Buffer.alloc(MAX_FILE_BYTES + 1, 120));
  expect((await tools.execute("view", { path: "large.txt" }, { cwd })).code).toBe("FILE_TOO_LARGE");
  await writeFile(path.join(cwd, "binary"), Buffer.from([0, 1, 2]));
  expect((await tools.execute("view", { path: "binary" }, { cwd })).code).toBe("UNSUPPORTED_FILE");
  expect((await tools.execute("view", { path: "." }, { cwd })).code).toBe("UNSUPPORTED_FILE");
});
it("filters extensions before spending the candidate-file budget", async () => {
  const { cwd, tools } = await fixture();
  await Promise.all(Array.from({ length: 1000 }, (_, i) => writeFile(path.join(cwd, `a-${i}.md`), "irrelevant")));
  await writeFile(path.join(cwd, "z.ts"), "needle");
  const result = await tools.execute("grep", { pattern: "needle", fileExtension: ".ts" }, { cwd });
  expect(result.output).toContain("z.ts:1: needle"); expect(result.data).toMatchObject({ searchedFiles: 1, partial: false });
});
it("rejects unsafe link edits, preserves line endings on precise edits and reports no-match accurately", async () => {
  const { cwd, tools } = await fixture(); await writeFile(path.join(cwd, "a.ts"), "first\r\nsecond\r\n"); await symlink(path.join(cwd, "a.ts"), path.join(cwd, "alias.ts"));
  const link = await tools.execute("str_replace", { path: "alias.ts", oldText: "first", newText: "new" }, { cwd });
  expect(link.code).toBe("UNSUPPORTED_FILE"); expect(await readFile(path.join(cwd, "a.ts"), "utf8")).toContain("first");
  const edit = await tools.execute("str_replace", { path: "a.ts", oldText: "first", newText: "new" }, { cwd });
  expect(edit.ok).toBe(true); expect(await readFile(path.join(cwd, "a.ts"), "utf8")).toBe("new\r\nsecond\r\n");
  const missing = await tools.execute("str_replace", { path: "a.ts", oldText: "absent", newText: "bad" }, { cwd });
  expect(missing).toMatchObject({ code: "NO_MATCH", effects: { changed: false, uncertainChanges: false } });
  expect((await tools.execute("str_replace", { path: "missing.ts", oldText: "a", newText: "b" }, { cwd })).effects?.uncertainChanges).toBe(false);
});
