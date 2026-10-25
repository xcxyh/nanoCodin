import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadRuntimeConfig, serializeConfigYaml } from "../../src/config/load.js";
import { parseSimpleYaml, stringifySimpleYaml } from "../../src/config/yaml.js";
import { DEFAULT_RUNTIME_CONFIG } from "../../src/core/runtimeConfig.js";

const originalEnv = { ...process.env };
afterEach(() => { process.env = { ...originalEnv }; });
async function fixture(yaml = "") {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "nanocodin-config-"));
  const home = await mkdtemp(path.join(os.tmpdir(), "nanocodin-config-home-"));
  process.env.NANOCODIN_HOME = home;
  for (const key of ["MODEL_PROVIDER", "MODEL_NAME", "MODEL_API_KEY", "MODEL_BASE_URL", "OPENAI_API_KEY", "OPENAI_MODEL", "OPENAI_BASE_URL", "AGENT_MAX_STEPS"]) delete process.env[key];
  if (yaml) await writeFile(path.join(home, "config.yaml"), yaml);
  return { cwd, home };
}
describe("one configuration model", () => {
  it("applies YAML, environment, CLI precedence without loading AGENTS as config", async () => {
    const { cwd } = await fixture("model:\n  provider: openai\n  name: yaml-model\n  apiKey: yaml-key\nagent:\n  maxSteps: 11\n  recursionLimit: 2\n  phaseLimits:\n    discover: 1\nsandbox:\n  defaultPolicy: deny");
    process.env.MODEL_NAME = "env-model"; process.env.MODEL_API_KEY = "env-key"; process.env.AGENT_MAX_STEPS = "9";
    await writeFile(path.join(cwd, "AGENTS.md"), "# Rules\n- Do not change the config");
    const { config } = loadRuntimeConfig(cwd, ["--max-steps=15", "--sandbox-policy=ask"]);
    expect(config.model).toMatchObject({ name: "env-model", apiKey: "env-key" });
    expect(config.agent).toEqual({ maxSteps: 15, maxHistoryChars: 48000 });
    expect(config.sandbox.defaultPolicy).toBe("ask");
  });
  it("fails clearly on invalid supported fields and ignores removed feature keys", async () => {
    const { cwd, home } = await fixture("agent:\n  maxSteps: invalid");
    expect(() => loadRuntimeConfig(cwd, [])).toThrow("agent.maxSteps");
    await writeFile(path.join(home, "config.yaml"), "repoIndex:\n  enabled: true\nrecovery:\n  enabled: true");
    expect(loadRuntimeConfig(cwd, []).config).not.toHaveProperty("repoIndex");
    expect(() => loadRuntimeConfig(cwd, ["--max-steps=2oops"])).toThrow("positive integer");
    expect(() => loadRuntimeConfig(cwd, ["--sandbox-policy=bad"])).toThrow("sandbox.defaultPolicy");
    expect(() => loadRuntimeConfig(cwd, ["--sandbox-timeout-ms=nope"])).toThrow("integer");
  });
  it("clamps operational bounds and round-trips supported configuration", async () => {
    const { cwd } = await fixture("agent:\n  maxHistoryChars: 1\nsandbox:\n  timeoutMs: 999999\n  maxOutputBytes: 1");
    const config = loadRuntimeConfig(cwd, []).config;
    expect(config.agent.maxHistoryChars).toBe(1000);
    expect(config.sandbox.timeoutMs).toBe(120000);
    expect(config.sandbox.maxOutputBytes).toBe(1024);
    expect(parseSimpleYaml(serializeConfigYaml(config))).toMatchObject({ agent: config.agent });
    expect(serializeConfigYaml(DEFAULT_RUNTIME_CONFIG)).not.toMatch(/phaseLimits|recursionLimit|repoIndex|recovery/);
  });
  it("parses YAML strings, nested arrays, escaped quotes and comment lines", () => {
    const text = stringifySimpleYaml({ model: { name: "quoted \"model\"", apiKey: "a,b:c" }, sandbox: { allowPrefixes: ["node -e \"x\"", "echo a,b"] } });
    expect(parseSimpleYaml(text)).toEqual({ model: { name: 'quoted "model"', apiKey: "a,b:c" }, sandbox: { allowPrefixes: ['node -e "x"', "echo a,b"] } });
  });
});
