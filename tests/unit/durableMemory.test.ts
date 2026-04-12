import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DurableMemoryStore, loadDurableMemory } from "../../src/services/durableMemory.js";
import { createDurableMemoryEntry } from "../../src/services/memoryManager.js";
import { resolveNanoCodinPaths } from "../../src/services/userPaths.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("durableMemory", () => {
  it("loads structured durable memory and legacy memory.md together", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "nanocodin-durable-memory-"));
    process.env.NANOCODIN_HOME = await mkdtemp(path.join(os.tmpdir(), "nanocodin-home-"));
    const paths = resolveNanoCodinPaths(cwd);
    await mkdir(paths.workspaceStateDir, { recursive: true });
    await writeFile(paths.durableMemoryPath, JSON.stringify({
      entries: [
        {
          id: "entry-1",
          kind: "decision",
          content: "Prefer targeted rg searches.",
          tags: ["search"],
          createdAt: 1,
          updatedAt: 1
        }
      ]
    }, null, 2));
    await writeFile(paths.memoryPath, "Legacy note");

    const memory = await loadDurableMemory(cwd);

    expect(memory.entries).toHaveLength(1);
    expect(memory.entries[0]?.content).toBe("Prefer targeted rg searches.");
    expect(memory.legacyText).toBe("Legacy note");
  });

  it("deduplicates durable memory writes by kind and content", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "nanocodin-durable-store-"));
    process.env.NANOCODIN_HOME = await mkdtemp(path.join(os.tmpdir(), "nanocodin-home-"));
    const store = new DurableMemoryStore(cwd);

    await store.upsert(createDurableMemoryEntry("preference", "Always keep diffs small.", ["style"]));
    const memory = await store.upsert(createDurableMemoryEntry("preference", "Always keep diffs small.", ["review"]));
    const saved = JSON.parse(await readFile(resolveNanoCodinPaths(cwd).durableMemoryPath, "utf8")) as {
      entries: Array<{ tags: string[] }>;
    };

    expect(memory.entries).toHaveLength(1);
    expect(saved.entries[0]?.tags.sort()).toEqual(["review", "style"]);
  });
});
