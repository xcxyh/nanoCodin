import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_RUNTIME_CONFIG } from "../../src/core/runtimeConfig.js";

const hoisted = vi.hoisted(() => ({
  renderSpy: vi.fn(),
  checkpointLoadSpy: vi.fn().mockResolvedValue(null),
  checkpointListSpy: vi.fn().mockResolvedValue([]),
  ensureWorkspaceStateSpy: vi.fn().mockResolvedValue(undefined),
  runBootstrapSpy: vi.fn().mockImplementation(async (config) => config)
}));

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
      agentsPath: "/repo/AGENTS.md",
      contextPath: "/Users/test/.nanocodin/workspaces/abc123/context.md",
      memoryPath: "/Users/test/.nanocodin/workspaces/abc123/memory.md"
    }
  }),
  isModelConfigComplete: () => true
}));

vi.mock("../../src/services/contextLoader.js", () => ({
  loadContextSources: () => ({
    sources: {
      projectRules: [],
      projectContext: null,
      persistentMemory: null,
      availableSkills: null
    },
    paths: {
      agentsPath: "/repo/AGENTS.md",
      contextPath: "/Users/test/.nanocodin/workspaces/abc123/context.md",
      memoryPath: "/Users/test/.nanocodin/workspaces/abc123/memory.md"
    }
  })
}));

vi.mock("../../src/services/repoIndexer.js", () => ({
  RepoIndexer: class {
    init() {
      return Promise.resolve();
    }
  }
}));

vi.mock("../../src/core/permission.js", () => ({
  PermissionController: class {}
}));

vi.mock("../../src/services/workspaceState.js", () => ({
  ensureWorkspaceState: (...args: unknown[]) => hoisted.ensureWorkspaceStateSpy(...args)
}));

vi.mock("../../src/bootstrap/runBootstrap.js", () => ({
  runBootstrap: (...args: unknown[]) => hoisted.runBootstrapSpy(...args)
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

describe("runCli", () => {
  beforeEach(() => {
    hoisted.renderSpy.mockClear();
    hoisted.checkpointLoadSpy.mockReset();
    hoisted.checkpointLoadSpy.mockResolvedValue(null);
    hoisted.checkpointListSpy.mockReset();
    hoisted.checkpointListSpy.mockResolvedValue([]);
    hoisted.ensureWorkspaceStateSpy.mockClear();
    hoisted.runBootstrapSpy.mockClear();
  });

  it("prints config without rendering the UI", async () => {
    const { runCli } = await import("../../src/cli/runCli.js");
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runCli(["--print-config"], {
      stdout: (message) => stdout.push(message),
      stderr: (message) => stderr.push(message)
    }, process.cwd());

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join("\n")).toContain("Effective config");
    expect(stdout.join("\n")).toContain("configYamlPath");
    expect(hoisted.renderSpy).not.toHaveBeenCalled();
  });

  it("returns an error when a resume checkpoint is missing", async () => {
    const { runCli } = await import("../../src/cli/runCli.js");
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runCli(["--resume", "missing-id"], {
      stdout: (message) => stdout.push(message),
      stderr: (message) => stderr.push(message)
    }, process.cwd());

    expect(exitCode).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join("\n")).toContain("Checkpoint not found: missing-id");
    expect(hoisted.renderSpy).not.toHaveBeenCalled();
  });

  it("passes modelName into ConsoleApp", async () => {
    const { runCli } = await import("../../src/cli/runCli.js");

    const exitCode = await runCli([], {
      stdout: () => undefined,
      stderr: () => undefined
    }, process.cwd());

    expect(exitCode).toBe(0);
    const element = hoisted.renderSpy.mock.calls[0]?.[0];
    expect(element?.props).toMatchObject({
      modelName: "gpt-5.4-mini",
      version: "0.1.6",
      cwd: process.cwd()
    });
    expect(hoisted.ensureWorkspaceStateSpy).toHaveBeenCalledTimes(1);
  });
});
