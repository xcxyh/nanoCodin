import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_RUNTIME_CONFIG } from "../../src/core/runtimeConfig.js";
import { runBootstrap } from "../../src/bootstrap/runBootstrap.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("runBootstrap", () => {
  it("writes ~/.nanocodin/config.yaml with prompted model settings", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "nanocodin-bootstrap-cwd-"));
    process.env.NANOCODIN_HOME = await mkdtemp(path.join(os.tmpdir(), "nanocodin-home-"));
    const answers = ["anthropic", "", "claude-3-5-haiku-latest", "test-api-key"];
    const output: string[] = [];

    const config = await runBootstrap({
      ...JSON.parse(JSON.stringify(DEFAULT_RUNTIME_CONFIG)),
      model: {
        provider: null,
        name: null,
        baseUrl: null,
        apiKey: null
      }
    }, cwd, {
      stdout: (message) => output.push(message),
      stderr: (message) => output.push(message),
      prompt: async () => answers.shift() ?? ""
    });

    expect(config.model).toEqual({
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com/v1",
      name: "claude-3-5-haiku-latest",
      apiKey: "test-api-key"
    });

    const saved = await readFile(path.join(process.env.NANOCODIN_HOME!, "config.yaml"), "utf8");
    expect(saved).toContain("provider: anthropic");
    expect(saved).toContain("apiKey: test-api-key");
    expect(output.join("\n")).toContain("Bootstrap: writing config");
  });
});
