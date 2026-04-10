import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  discoverSkills,
  formatSkillDescriptionForList,
  formatSkillsForPrompt,
  parseSkillFile
} from "../../src/services/skills.js";

describe("skills loader", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map(async (dir) => {
      const fs = await import("node:fs/promises");
      await fs.rm(dir, { recursive: true, force: true });
    }));
    tempDirs.length = 0;
  });

  it("parses frontmatter name and description", () => {
    const parsed = parseSkillFile([
      "---",
      "name: demo-skill",
      "description: Demo description",
      "---",
      "",
      "# Demo"
    ].join("\n"), "/tmp/demo-skill/SKILL.md");

    expect(parsed).toEqual({
      name: "demo-skill",
      description: "Demo description"
    });
  });

  it("falls back to the directory name when frontmatter is missing", () => {
    const parsed = parseSkillFile("# No frontmatter\n", "/tmp/fallback-name/SKILL.md");
    expect(parsed).toEqual({
      name: "fallback-name",
      description: ""
    });
  });

  it("deduplicates same-name skills with first root winning", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "nanocodin-skills-workspace-"));
    const homeRoot = await mkdtemp(path.join(os.tmpdir(), "nanocodin-skills-home-"));
    const agentsRoot = await mkdtemp(path.join(os.tmpdir(), "nanocodin-skills-agents-"));
    tempDirs.push(workspaceRoot, homeRoot, agentsRoot);

    await mkdir(path.join(workspaceRoot, "release-publish"), { recursive: true });
    await mkdir(path.join(homeRoot, "release-publish"), { recursive: true });
    await mkdir(path.join(agentsRoot, "spec-design"), { recursive: true });

    await writeFile(path.join(workspaceRoot, "release-publish", "SKILL.md"), [
      "---",
      "name: release-publish",
      "description: Workspace version",
      "---"
    ].join("\n"), "utf8");
    await writeFile(path.join(homeRoot, "release-publish", "SKILL.md"), [
      "---",
      "name: release-publish",
      "description: Home version",
      "---"
    ].join("\n"), "utf8");
    await writeFile(path.join(agentsRoot, "spec-design", "SKILL.md"), [
      "---",
      "name: spec-design",
      "description: Agents version",
      "---"
    ].join("\n"), "utf8");

    const loaded = await discoverSkills([
      { dir: workspaceRoot, sourceScope: "workspace" },
      { dir: homeRoot, sourceScope: "nanocodin_home" },
      { dir: agentsRoot, sourceScope: "agents_home" }
    ]);

    expect(loaded).toEqual([
      expect.objectContaining({
        name: "release-publish",
        description: "Workspace version",
        sourceScope: "workspace",
        command: "/release-publish"
      }),
      expect.objectContaining({
        name: "spec-design",
        description: "Agents version",
        sourceScope: "agents_home",
        command: "/spec-design"
      })
    ]);
  });

  it("normalizes list descriptions to a single trimmed line", () => {
    expect(formatSkillDescriptionForList("line one\nline two\tline three")).toBe("line one line two line three");
  });

  it("formats available skills for prompt registration", () => {
    const formatted = formatSkillsForPrompt([
      {
        name: "frontend-design",
        description: "Create distinctive\nfrontend interfaces.",
        sourcePath: "/Users/test/.agents/skills/frontend-design/SKILL.md",
        sourceScope: "agents_home",
        command: "/frontend-design"
      }
    ]);

    expect(formatted).toContain("$frontend-design");
    expect(formatted).toContain("Create distinctive frontend interfaces.");
    expect(formatted).toContain("/Users/test/.agents/skills/frontend-design/SKILL.md");
  });
});
