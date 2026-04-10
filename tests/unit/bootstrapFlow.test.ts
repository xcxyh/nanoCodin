import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_RUNTIME_CONFIG } from "../../src/core/runtimeConfig.js";

const hoisted = vi.hoisted(() => ({
  renderSpy: vi.fn(),
  runBootstrapSpy: vi.fn(),
  ensureWorkspaceStateSpy: vi.fn().mockResolvedValue(undefined),
  loadRuntimeConfigSpy: vi.fn()
}));

vi.mock("ink", () => ({
  render: hoisted.renderSpy
}));

vi.mock("../../src/bootstrap/runBootstrap.js", () => ({
  runBootstrap: (...args: unknown[]) => hoisted.runBootstrapSpy(...args)
}));

vi.mock("../../src/services/workspaceState.js", () => ({
  ensureWorkspaceState: (...args: unknown[]) => hoisted.ensureWorkspaceStateSpy(...args)
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
  loadRuntimeConfig: (...args: unknown[]) => hoisted.loadRuntimeConfigSpy(...args),
  isModelConfigComplete: (model: { apiKey?: string | null }) => Boolean(model.apiKey)
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

vi.mock("../../src/services/sessionCheckpoint.js", () => ({
  FileSessionCheckpointStore: class {
    load() {
      return Promise.resolve(null);
    }

    list() {
      return Promise.resolve([]);
    }

    save() {
      return Promise.resolve(null);
    }

    clear() {
      return Promise.resolve();
    }
  }
}));

describe("runCli bootstrap flow", () => {
  beforeEach(() => {
    hoisted.renderSpy.mockClear();
    hoisted.runBootstrapSpy.mockReset();
    hoisted.ensureWorkspaceStateSpy.mockClear();
    hoisted.loadRuntimeConfigSpy.mockReset();
  });

  it("runs bootstrap before rendering when config.yaml is missing", async () => {
    const incompleteConfig = {
      ...JSON.parse(JSON.stringify(DEFAULT_RUNTIME_CONFIG)),
      model: {
        provider: "openai",
        name: "gpt-5.4-mini",
        baseUrl: null,
        apiKey: null
      }
    };
    const completeConfig = {
      ...incompleteConfig,
      model: {
        provider: "openai",
        name: "gpt-5.4-mini",
        baseUrl: null,
        apiKey: "bootstrapped-key"
      }
    };

    hoisted.loadRuntimeConfigSpy
      .mockReturnValueOnce({
        config: incompleteConfig,
        sources: {
          configYamlPath: "/Users/test/.nanocodin/config.yaml",
          configYamlExists: false,
          workspaceStateDir: "/Users/test/.nanocodin/workspaces/abc123",
          workspaceId: "abc123",
          agentsPath: "/repo/AGENTS.md",
          contextPath: "/Users/test/.nanocodin/workspaces/abc123/context.md",
          memoryPath: "/Users/test/.nanocodin/workspaces/abc123/memory.md"
        }
      })
      .mockReturnValueOnce({
        config: completeConfig,
        sources: {
          configYamlPath: "/Users/test/.nanocodin/config.yaml",
          configYamlExists: true,
          workspaceStateDir: "/Users/test/.nanocodin/workspaces/abc123",
          workspaceId: "abc123",
          agentsPath: "/repo/AGENTS.md",
          contextPath: "/Users/test/.nanocodin/workspaces/abc123/context.md",
          memoryPath: "/Users/test/.nanocodin/workspaces/abc123/memory.md"
        }
      });
    hoisted.runBootstrapSpy.mockResolvedValue(completeConfig);

    const { runCli } = await import("../../src/cli/runCli.js");
    const exitCode = await runCli([], {
      stdout: () => undefined,
      stderr: () => undefined
    }, process.cwd());

    expect(exitCode).toBe(0);
    expect(hoisted.runBootstrapSpy).toHaveBeenCalledTimes(1);
    expect(hoisted.loadRuntimeConfigSpy).toHaveBeenCalledTimes(2);
    expect(hoisted.ensureWorkspaceStateSpy).toHaveBeenCalledTimes(1);
    expect(hoisted.renderSpy).toHaveBeenCalledTimes(1);
  });
});
