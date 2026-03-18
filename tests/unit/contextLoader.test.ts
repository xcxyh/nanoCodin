import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadContextSources } from "../../src/services/contextLoader.js";

describe("loadContextSources", () => {
  it("loads AGENTS rules, context.md, and memory.md when present", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "nanocodin-context-"));
    await mkdir(path.join(cwd, ".nanocodin"), { recursive: true });
    await writeFile(path.join(cwd, "AGENTS.md"), "# Rules\n- Keep diffs small\n- Verify before final\n");
    await writeFile(path.join(cwd, ".nanocodin", "context.md"), "Architecture overview");
    await writeFile(path.join(cwd, ".nanocodin", "memory.md"), "Remember the test command");

    const loaded = loadContextSources(cwd);

    expect(loaded.sources.projectRules).toEqual(["Keep diffs small", "Verify before final"]);
    expect(loaded.sources.projectContext).toBe("Architecture overview");
    expect(loaded.sources.persistentMemory).toBe("Remember the test command");
  });

  it("returns empty values when optional files are missing", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "nanocodin-context-"));

    const loaded = loadContextSources(cwd);

    expect(loaded.sources.projectRules).toEqual([]);
    expect(loaded.sources.projectContext).toBeNull();
    expect(loaded.sources.persistentMemory).toBeNull();
  });
});
