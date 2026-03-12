import { describe, expect, it } from "vitest";
import { bashTool, decidePolicy, isWriteCommand } from "../../src/tools/shell/bash.js";
import { createToolContext } from "../fixtures/runtime.js";

describe("bash policy helpers", () => {
  it("detects write-like commands", () => {
    expect(isWriteCommand("echo hi > a.txt")).toBe(true);
    expect(isWriteCommand("mkdir tmp-dir")).toBe(true);
    expect(isWriteCommand("rg keyword src")).toBe(false);
  });

  it("returns deny when command matches deny patterns", () => {
    const context = createToolContext();
    context.runtimeConfig.sandbox.denyPatterns = ["rm -rf /"];

    expect(decidePolicy("rm -rf /", context)).toBe("deny");
  });

  it("returns allow when command matches allow prefixes", () => {
    const context = createToolContext();
    context.runtimeConfig.sandbox.allowPrefixes = ["npm run test"];

    expect(decidePolicy("npm run test", context)).toBe("allow");
  });

  it("returns ask for explicit ask prefix and write command", () => {
    const context = createToolContext();
    context.runtimeConfig.sandbox.askPrefixes = ["git push"];
    context.runtimeConfig.sandbox.defaultPolicy = "deny";

    expect(decidePolicy("git push origin main", context)).toBe("ask");
    expect(decidePolicy("touch hello.txt", context)).toBe("ask");
  });

  it("ignores invalid deny regex and falls back to default", () => {
    const context = createToolContext();
    context.runtimeConfig.sandbox.denyPatterns = ["[bad-regex"];
    context.runtimeConfig.sandbox.defaultPolicy = "allow";

    expect(decidePolicy("echo safe", context)).toBe("ask");
    expect(decidePolicy("ls", context)).toBe("allow");
  });

  it("allows confirmed commands even when policy is ask", async () => {
    const context = createToolContext();
    const result = await bashTool.execute({ command: "echo test", confirmed: true }, context);

    expect(result.ok).toBe(true);
  });

  it("still denies confirmed commands when policy is deny", async () => {
    const context = createToolContext();
    const result = await bashTool.execute({ command: "rm -rf /", confirmed: true }, context);

    expect(result.ok).toBe(false);
  });
});
