import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_RUNTIME_CONFIG } from "../../src/core/runtimeConfig.js";

const hoisted = vi.hoisted(() => {
  return {
    renderSpy: vi.fn(),
    initSpy: vi.fn().mockResolvedValue(undefined),
    graphCtorSpy: vi.fn()
  };
});

vi.mock("ink", () => ({
  render: hoisted.renderSpy
}));

vi.mock("../../src/llm/modelRouter.js", () => ({
  createModelProviderFromEnv: () => ({
    generate: vi.fn().mockResolvedValue({ text: "" })
  })
}));

vi.mock("../../src/tools/registry.js", () => ({
  createDefaultToolRegistry: () => ({ list: () => [] })
}));

vi.mock("../../src/services/configLoader.js", () => ({
  loadRuntimeConfig: () => ({
    config: JSON.parse(JSON.stringify(DEFAULT_RUNTIME_CONFIG)),
    sources: {
      configTomlPath: "",
      agentsPath: ""
    }
  })
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
  ConsoleApp: () => null
}));

const originalEnv = { ...process.env };

describe("index smoke", () => {
  beforeEach(() => {
    hoisted.renderSpy.mockClear();
    hoisted.initSpy.mockClear();
    hoisted.graphCtorSpy.mockClear();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("buildRuntimeEnv does not overwrite existing env vars", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "nanocodin-env-"));
    const envPath = path.join(cwd, ".env");
    await writeFile(envPath, "EXISTING=from-file\nNANOCODIN_SMOKE_NEW_KEY=new-value\n", "utf8");

    process.env.EXISTING = "from-process";

    const { buildRuntimeEnv } = await import("../../src/index.js");
    const env = buildRuntimeEnv(envPath);

    expect(env.EXISTING).toBe("from-process");
    expect(env.NANOCODIN_SMOKE_NEW_KEY).toBe("new-value");
  });

  it("parsePositiveIntEnv falls back on invalid values", async () => {
    const { parsePositiveIntEnv } = await import("../../src/index.js");

    expect(parsePositiveIntEnv("25", 10)).toBe(25);
    expect(parsePositiveIntEnv("0", 10)).toBe(10);
    expect(parsePositiveIntEnv("abc", 10)).toBe(10);
    expect(parsePositiveIntEnv(undefined, 10)).toBe(10);
  });

  it("main boots without crashing when dependencies are mocked", async () => {
    const { main } = await import("../../src/index.js");

    main();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(hoisted.initSpy).toHaveBeenCalledTimes(1);
    expect(hoisted.graphCtorSpy).toHaveBeenCalledTimes(1);
    expect(hoisted.renderSpy).toHaveBeenCalledTimes(1);
  });
});
