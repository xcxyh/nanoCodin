import { describe, expect, it } from "vitest";
import {
  buildSlashCommandTemplate,
  buildSlashCommands,
  filterSlashCommands,
  getSlashCommandQuery,
  resolveSlashSubmission
} from "../../src/ui/utils/slashCommands.js";

describe("slash commands", () => {
  const slashCommands = buildSlashCommands([
    {
      name: "release-publish",
      description: "Publish a release",
      sourcePath: "/tmp/release-publish/SKILL.md",
      sourceScope: "workspace",
      command: "/release-publish"
    }
  ]);

  it("includes builtins before skill commands", () => {
    expect(slashCommands.slice(0, 3).map((command) => command.name)).toEqual([
      "clear",
      "quit",
      "release-publish"
    ]);
  });

  it("filters commands by name or description", () => {
    expect(filterSlashCommands(slashCommands, "publish").map((command) => command.name)).toEqual(["release-publish"]);
    expect(filterSlashCommands(slashCommands, "quit").map((command) => command.name)).toEqual(["quit"]);
  });

  it("uses single-line descriptions in the command list", () => {
    const commands = buildSlashCommands([
      {
        name: "frontend-design",
        description: "Create distinctive,\nproduction-grade frontend interfaces.",
        sourcePath: "/tmp/frontend-design/SKILL.md",
        sourceScope: "agents_home",
        command: "/frontend-design"
      }
    ]);

    expect(commands[2]?.description).toBe("Create distinctive, production-grade frontend interfaces.");
  });

  it("returns slash query only for input-head command tokens", () => {
    expect(getSlashCommandQuery("/rel", 4)).toBe("rel");
    expect(getSlashCommandQuery("   /rel", 7)).toBe("rel");
    expect(getSlashCommandQuery("/release-publish now", 18)).toBeNull();
    expect(getSlashCommandQuery("ship /release-publish", 21)).toBeNull();
  });

  it("builds a template with trailing space", () => {
    expect(buildSlashCommandTemplate(slashCommands[2]!)).toBe("/release-publish ");
  });

  it("translates skill commands to existing skill invocation syntax", () => {
    expect(resolveSlashSubmission("/release-publish v0.1.7", slashCommands)).toEqual({
      kind: "task",
      task: "$release-publish v0.1.7"
    });
  });

  it("routes builtins locally and leaves unknown slash text untouched", () => {
    expect(resolveSlashSubmission("/clear", slashCommands)).toEqual({
      kind: "builtin",
      commandName: "clear"
    });

    expect(resolveSlashSubmission("/unknown value", slashCommands)).toEqual({
      kind: "task",
      task: "/unknown value"
    });
  });
});
