import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_RUNTIME_CONFIG } from "../../src/core/runtimeConfig.js";

const hoisted = vi.hoisted(() => {
  return {
    renderSpy: vi.fn(),
    initSpy: vi.fn().mockResolvedValue(undefined),
    graphCtorSpy: vi.fn(),
    consoleAppSpy: vi.fn(),
    loadSkillsSpy: vi.fn().mockResolvedValue([
      {
        name: "release-publish",
        description: "Publish a release",
        sourcePath: "/tmp/release-publish/SKILL.md",
        sourceScope: "workspace",
        command: "/release-publish"
      }
    ]),
    checkpointLoadSpy: vi.fn().mockResolvedValue(null),
    checkpointListSpy: vi.fn().mockResolvedValue([]),
    ensureWorkspaceStateSpy: vi.fn().mockResolvedValue(undefined),
    runBootstrapSpy: vi.fn().mockImplementation(async (config) => config)
  };
});

vi.mock("ink", () => ({
  render: hoisted.renderSpy
}));

vi.mock("../../src/llm/modelRouter.js", () => ({
  createModelProvider: () => ({
    generate: vi.fn().mockResolvedValue({ text: "" })
  }),
  getConfiguredModelName: () => "gpt-5.4-mini"
}));

vi.mock("../../src/tools/registry.js", () => ({
  createDefaultToolRegistry: () => ({ list: () => [] })
}));

vi.mock("../../src/services/configLoader.js", () => ({
  loadRuntimeConfig: () => ({
    config: {
      ...JSON.parse(JSON.stringify(DEFAULT_RUNTIME_CONFIG)),
      model: {
        provider: "openai",
        name: "gpt-5.4-mini",
        baseUrl: null,
        apiKey: "test-key"
      }
    },
    sources: {
      configYamlPath: "/Users/test/.nanocodin/config.yaml",
      configYamlExists: true,
      workspaceStateDir: "/Users/test/.nanocodin/workspaces/abc123",
      workspaceId: "abc123",
      agentsPath: "",
      contextPath: "",
      memoryPath: ""
    }
  }),
  isModelConfigComplete: () => true
}));

vi.mock("../../src/services/repoIndexer.js", () => ({
  RepoIndexer: class {
    init() {
      return hoisted.initSpy();
    }

    query() {
      return [];
    }

    snapshot() {
      return null;
    }
  }
}));

vi.mock("../../src/agent/agentGraph.js", () => ({
  CodingAgentGraph: class {
    constructor(...args: unknown[]) {
      hoisted.graphCtorSpy(...args);
    }
  }
}));

vi.mock("../../src/ui/consoleApp.js", () => ({
  ConsoleApp: (props: unknown) => {
    hoisted.consoleAppSpy(props);
    return null;
  }
}));

vi.mock("../../src/services/sessionCheckpoint.js", () => ({
  FileSessionCheckpointStore: class {
    load(sessionId?: string) {
      return hoisted.checkpointLoadSpy(sessionId);
    }

    list() {
      return hoisted.checkpointListSpy();
    }

    save() {
      return Promise.resolve(null);
    }

    clear() {
      return Promise.resolve();
    }
  }
}));

vi.mock("../../src/services/skills.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/skills.js")>();
  return {
    ...actual,
    loadSkills: (...args: unknown[]) => hoisted.loadSkillsSpy(...args)
  };
});

vi.mock("../../src/services/workspaceState.js", () => ({
  ensureWorkspaceState: (...args: unknown[]) => hoisted.ensureWorkspaceStateSpy(...args)
}));

vi.mock("../../src/bootstrap/runBootstrap.js", () => ({
  runBootstrap: (...args: unknown[]) => hoisted.runBootstrapSpy(...args)
}));

const originalEnv = { ...process.env };

describe("index smoke", () => {
  beforeEach(() => {
    hoisted.renderSpy.mockClear();
    hoisted.initSpy.mockClear();
    hoisted.graphCtorSpy.mockClear();
    hoisted.consoleAppSpy.mockClear();
    hoisted.loadSkillsSpy.mockClear();
    hoisted.checkpointLoadSpy.mockClear();
    hoisted.checkpointListSpy.mockClear();
    hoisted.ensureWorkspaceStateSpy.mockClear();
    hoisted.runBootstrapSpy.mockClear();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("parsePositiveIntEnv falls back on invalid values", async () => {
    const { parsePositiveIntEnv } = await import("../../src/index.js");

    expect(parsePositiveIntEnv("25", 10)).toBe(25);
    expect(parsePositiveIntEnv("0", 10)).toBe(10);
    expect(parsePositiveIntEnv("abc", 10)).toBe(10);
    expect(parsePositiveIntEnv(undefined, 10)).toBe(10);
  });

  it("treats symlinked argv[1] as direct execution", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "nanocodin-link-"));
    const realEntry = path.join(cwd, "real-index.js");
    const linkedEntry = path.join(cwd, "linked-index.js");
    await writeFile(realEntry, "", "utf8");

    const fs = await import("node:fs");
    fs.symlinkSync(realEntry, linkedEntry);

    const { isDirectExecution } = await import("../../src/index.js");

    expect(isDirectExecution(pathToFileURL(realEntry).href, linkedEntry)).toBe(true);
  });

  it("main boots without crashing when dependencies are mocked", async () => {
    const { main } = await import("../../src/index.js");

    const exitCode = await main([]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(exitCode).toBe(0);
    expect(hoisted.initSpy).toHaveBeenCalledTimes(1);
    expect(hoisted.graphCtorSpy).toHaveBeenCalledTimes(1);
    expect(hoisted.renderSpy).toHaveBeenCalledTimes(1);
    expect(hoisted.ensureWorkspaceStateSpy).toHaveBeenCalledTimes(1);
  });

  it("main returns help without starting the UI", async () => {
    const { main } = await import("../../src/index.js");

    const exitCode = await main(["--help"]);

    expect(exitCode).toBe(0);
    expect(hoisted.renderSpy).not.toHaveBeenCalled();
    expect(hoisted.graphCtorSpy).not.toHaveBeenCalled();
  });

  it("passes initial prompt into ConsoleApp", async () => {
    const { main } = await import("../../src/index.js");

    const exitCode = await main(["--prompt", "fix failing tests"]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(exitCode).toBe(0);
    expect(hoisted.renderSpy).toHaveBeenCalledTimes(1);
    const element = hoisted.renderSpy.mock.calls[0]?.[0];
    expect(element?.props).toMatchObject({
      initialTask: "fix failing tests"
    });
  });

  it("passes modelName into ConsoleApp", async () => {
    const { main } = await import("../../src/index.js");

    const exitCode = await main([]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(exitCode).toBe(0);
    const element = hoisted.renderSpy.mock.calls[0]?.[0];
    expect(element?.props).toMatchObject({
      modelName: "gpt-5.4-mini",
      version: "0.1.6",
      cwd: process.cwd()
    });
  });

  it("passes slash commands into ConsoleApp", async () => {
    const { main } = await import("../../src/index.js");

    const exitCode = await main([]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(exitCode).toBe(0);
    const element = hoisted.renderSpy.mock.calls[0]?.[0];
    expect(element?.props?.slashCommands).toEqual([
      expect.objectContaining({ name: "clear", kind: "builtin" }),
      expect.objectContaining({ name: "quit", kind: "builtin" }),
      expect.objectContaining({ name: "release-publish", kind: "skill" })
    ]);
  });
});
