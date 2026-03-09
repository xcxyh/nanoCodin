import { describe, expect, it } from "vitest";
import { DEFAULT_RUNTIME_CONFIG } from "../../src/core/runtimeConfig.js";
import { applyValue, parseFlatToml } from "../../src/services/configLoader.js";

function cloneConfig() {
  return JSON.parse(JSON.stringify(DEFAULT_RUNTIME_CONFIG));
}

describe("configLoader parser helpers", () => {
  it("parses flat TOML with sections and arrays", () => {
    const parsed = parseFlatToml(`
      [agent]
      max_steps = 20
      verify_required_keywords = ["fix", "测试"]

      [sandbox]
      default_policy = "allow"
      allow_prefixes = ["ls", "cat"]
    `);

    expect(parsed).toEqual({
      "agent.max_steps": 20,
      "agent.verify_required_keywords": ["fix", "测试"],
      "sandbox.default_policy": "allow",
      "sandbox.allow_prefixes": ["ls", "cat"]
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
});
