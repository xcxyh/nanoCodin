import { describe, expect, it } from "vitest";
import { DEFAULT_RUNTIME_CONFIG } from "../../src/core/runtimeConfig.js";
import { applyValue } from "../../src/services/configLoader.js";
import { parseSimpleYaml } from "../../src/services/yamlConfig.js";

function cloneConfig() {
  return JSON.parse(JSON.stringify(DEFAULT_RUNTIME_CONFIG));
}

describe("configLoader parser helpers", () => {
  it("parses simple YAML with nested objects and arrays", () => {
    const parsed = parseSimpleYaml(`
agent:
  maxSteps: 20
  verifyRequiredKeywords: [fix, 测试]
sandbox:
  defaultPolicy: allow
  allowPrefixes: [ls, cat]
    `);

    expect(parsed).toEqual({
      agent: {
        maxSteps: 20,
        verifyRequiredKeywords: ["fix", "测试"]
      },
      sandbox: {
        defaultPolicy: "allow",
        allowPrefixes: ["ls", "cat"]
      }
    });
  });

  it("applies known config keys and ignores unknown keys", () => {
    const config = cloneConfig();

    applyValue(config, "agent.max_steps", 25);
    applyValue(config, "sandbox.default_policy", "deny");
    applyValue(config, "unknown.key", 123);

    expect(config.agent.maxSteps).toBe(25);
    expect(config.sandbox.defaultPolicy).toBe("deny");
  });

  it("clamps numeric boundaries", () => {
    const config = cloneConfig();

    applyValue(config, "sandbox.timeout_ms", 999999);
    applyValue(config, "compression.token_threshold_ratio", 5);
    applyValue(config, "compression.retain_recent_ratio", 0.01);

    expect(config.sandbox.timeoutMs).toBe(120000);
    expect(config.agent.compression.tokenThresholdRatio).toBe(1);
    expect(config.agent.compression.retainRecentRatio).toBe(0.2);
  });

  it("applies and clamps phase limits", () => {
    const config = cloneConfig();

    applyValue(config, "agent.phase_limits.discover", 12);
    applyValue(config, "agent.phase_limits.plan", 0);
    applyValue(config, "agent.phase_limits.execute_verify", 30.9);

    expect(config.agent.phaseLimits.discover).toBe(12);
    expect(config.agent.phaseLimits.plan).toBe(1);
    expect(config.agent.phaseLimits.executeVerify).toBe(30);
  });
});
