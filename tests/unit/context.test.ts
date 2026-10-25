import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadProjectInstructions } from "../../src/context/project.js";
import { resolveNanoCodinPaths } from "../../src/config/paths.js";
const originalEnv = { ...process.env };
afterEach(() => { process.env = { ...originalEnv }; });

describe("project context and skills", () => {
  it("loads project rules verbatim and skill bodies only when explicitly invoked", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "nanocodin-context-"));
    process.env.NANOCODIN_HOME = await mkdtemp(path.join(os.tmpdir(), "nanocodin-home-"));
    const skillDir = path.join(cwd, ".agents", "skills", "test-skill"); await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, "SKILL.md"), "---\nname: test-skill\ndescription: fixture\n---\nONLY_SELECTED_BODY");
    await writeFile(path.join(cwd, "AGENTS.md"), "# Code rules\n```text\nKEEP_THIS_RULE\n```");
    const paths = resolveNanoCodinPaths(cwd); await mkdir(paths.workspaceStateDir, { recursive: true }); await writeFile(paths.contextPath, "local project context");
    const normal = await loadProjectInstructions(cwd, "普通任务");
    expect(normal).toContain("KEEP_THIS_RULE"); expect(normal).toContain("local project context"); expect(normal).not.toContain("ONLY_SELECTED_BODY");
    expect(await loadProjectInstructions(cwd, "使用 $test-skill，执行")).toContain("ONLY_SELECTED_BODY");
    expect(await loadProjectInstructions(cwd, "/test-skill 执行")).toContain("ONLY_SELECTED_BODY");
    expect(await loadProjectInstructions(cwd, "continue", { version: 1, id: "x", cwd, createdAt: 1, events: [{ at: 1, type: "user", text: "$test-skill 执行", continuation: false }] })).toContain("ONLY_SELECTED_BODY");
  });
});
