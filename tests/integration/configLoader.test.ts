import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadRuntimeConfig } from "../../src/services/configLoader.js";

const originalArgv = [...process.argv];
const originalEnv = { ...process.env };

afterEach(() => {
  process.argv = [...originalArgv];
  process.env = { ...originalEnv };
});

describe("loadRuntimeConfig", () => {
  it("applies env -> toml -> cli override precedence", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "nanocodin-config-"));
    await mkdir(path.join(cwd, ".nanocodin"), { recursive: true });

    await writeFile(path.join(cwd, ".nanocodin", "config.toml"), `
      [agent]
      max_steps = 11
      recursion_limit = 22
      verify_required_keywords = ["fix", "repair"]

      [sandbox]
      default_policy = "deny"
    `);

    await writeFile(path.join(cwd, "AGENTS.md"), `
# Agent Notes
- Keep outputs concise

\`\`\`
Ignore this code block line
\`\`\`
- Enforce verification
    `);

    process.env.AGENT_MAX_STEPS = "9";
    process.argv = ["node", "script", "--max-steps=15", "--sandbox-policy=ask"];

    const loaded = loadRuntimeConfig(cwd).config;

    expect(loaded.agent.maxSteps).toBe(15);
    expect(loaded.agent.recursionLimit).toBe(22);
    expect(loaded.agent.verifyRequiredKeywords).toEqual(["fix", "repair"]);
    expect(loaded.sandbox.defaultPolicy).toBe("ask");
    expect(loaded.agentsGuidelines).toEqual(["Keep outputs concise", "Enforce verification"]);
  });

  it("enforces recursionLimit >= maxSteps + 2", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "nanocodin-config-"));
    await mkdir(path.join(cwd, ".nanocodin"), { recursive: true });
    await writeFile(path.join(cwd, ".nanocodin", "config.toml"), `
      [agent]
      max_steps = 20
      recursion_limit = 3
    `);

    const loaded = loadRuntimeConfig(cwd).config;

    expect(loaded.agent.maxSteps).toBe(20);
    expect(loaded.agent.recursionLimit).toBe(22);
  });

  it("parses extra CLI flags and ignores invalid env integers", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "nanocodin-config-"));
    process.env.AGENT_MAX_STEPS = "invalid";
    process.env.AGENT_RECURSION_LIMIT = "0";
    process.argv = [
      "node",
      "script",
      "--compression-threshold=0.8",
      "--verify-keywords=fix,refactor,测试"
    ];

    const loaded = loadRuntimeConfig(cwd).config;

    expect(loaded.agent.compression.tokenThresholdRatio).toBe(0.8);
    expect(loaded.agent.verifyRequiredKeywords).toEqual(["fix", "refactor", "测试"]);
  });
});
