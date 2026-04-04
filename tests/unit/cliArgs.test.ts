import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../../src/cli/parseArgs.js";

describe("parseCliArgs", () => {
  it("parses prompt, cwd, and config overrides", () => {
    const result = parseCliArgs(
      ["--cwd", "./examples", "--prompt", "fix tests", "--max-steps", "9", "--sandbox-policy=deny"],
      "/repo"
    );

    expect(result.ok).toBe(true);
    expect(result.args).toMatchObject({
      cwd: "/repo/examples",
      prompt: "fix tests",
      configArgv: ["--max-steps=9", "--sandbox-policy=deny"]
    });
  });

  it("prefers --prompt over positional input", () => {
    const result = parseCliArgs(["--prompt", "explicit task", "ignored positional"], "/repo");

    expect(result.ok).toBe(true);
    expect(result.args?.prompt).toBe("explicit task");
    expect(result.args?.warnings).toContain("Ignoring positional prompt because --prompt was provided.");
  });

  it("treats positional text as the initial prompt", () => {
    const result = parseCliArgs(["inspect", "the", "repo"], "/repo");

    expect(result.ok).toBe(true);
    expect(result.args?.prompt).toBe("inspect the repo");
  });

  it("disables new-session when resume is requested", () => {
    const result = parseCliArgs(["--resume", "--new-session"], "/repo");

    expect(result.ok).toBe(true);
    expect(result.args?.resume).toEqual({ enabled: true, sessionId: null });
    expect(result.args?.newSession).toBe(false);
    expect(result.args?.warnings).toContain("Ignoring --new-session because --resume was provided.");
  });

  it("rejects unknown flags", () => {
    const result = parseCliArgs(["--wat"], "/repo");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Unknown option");
  });
});
