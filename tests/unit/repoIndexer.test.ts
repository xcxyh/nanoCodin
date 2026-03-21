import { mkdtemp, writeFile, access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RepoIndexer } from "../../src/services/repoIndexer.js";
import { DEFAULT_RUNTIME_CONFIG } from "../../src/core/runtimeConfig.js";

describe("RepoIndexer", () => {
  it("does not write the repo index into the workspace by default", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "nanocodin-repo-"));
    await writeFile(path.join(cwd, "index.ts"), "export const hi = 1;\n", "utf8");
    const indexer = new RepoIndexer(cwd, DEFAULT_RUNTIME_CONFIG.repoIndex);

    await indexer.init();

    await expect(access(path.join(cwd, ".nanocodin", "index.json"))).rejects.toBeTruthy();
    expect(indexer.snapshot()?.entries.length).toBeGreaterThan(0);
  });
});
