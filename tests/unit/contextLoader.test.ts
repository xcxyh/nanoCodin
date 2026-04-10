import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadContextSources } from "../../src/services/contextLoader.js";
import { resolveNanoCodinPaths } from "../../src/services/userPaths.js";

describe("loadContextSources", () => {
  it("loads AGENTS rules, context.md, and memory.md when present", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "nanocodin-context-"));
    process.env.NANOCODIN_HOME = await mkdtemp(path.join(os.tmpdir(), "nanocodin-home-"));
    const paths = resolveNanoCodinPaths(cwd);
    await mkdir(paths.workspaceStateDir, { recursive: true });
    await writeFile(path.join(cwd, "AGENTS.md"), "# Rules\n- Keep diffs small\n- Verify before final\n");
    await writeFile(paths.contextPath, "Architecture overview");
    await writeFile(paths.memoryPath, "Remember the test command");

    const loaded = loadContextSources(cwd);

    expect(loaded.sources.projectRules).toEqual(["Keep diffs small", "Verify before final"]);
    expect(loaded.sources.projectContext).toBe("Architecture overview");
    expect(loaded.sources.persistentMemory).toBe("Remember the test command");
    expect(loaded.sources.availableSkills).toBeNull();
  });

  it("returns empty values when optional files are missing", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "nanocodin-context-"));
    process.env.NANOCODIN_HOME = await mkdtemp(path.join(os.tmpdir(), "nanocodin-home-"));

    const loaded = loadContextSources(cwd);

    expect(loaded.sources.projectRules).toEqual([]);
    expect(loaded.sources.projectContext).toBeNull();
    expect(loaded.sources.persistentMemory).toBeNull();
    expect(loaded.sources.availableSkills).toBeNull();
  });
});
