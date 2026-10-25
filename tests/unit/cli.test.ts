import { mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/runCli.js";
import { isDirectExecution, main } from "../../src/index.js";
const originalEnv = { ...process.env };
afterEach(() => { process.env = { ...originalEnv }; });
const capture = () => { const stdout: string[] = []; const stderr: string[] = []; return { stdout, stderr, io: { stdout: (text: string) => stdout.push(text), stderr: (text: string) => stderr.push(text) } }; };

describe("CLI entry points", () => {
  it("handles help, version and invalid arguments without starting a model or TUI", async () => {
    const output = capture();
    expect(await runCli(["--help"], output.io)).toBe(0);
    expect(output.stdout.join("\n")).toContain("--print");
    expect(await runCli(["--version"], output.io)).toBe(0);
    expect(output.stdout.at(-1)).toBe("0.2.0");
    expect(await runCli(["--unknown"], output.io)).toBe(1);
    expect(output.stderr.join("\n")).toContain("Unknown option");
  });
  it("prints effective config with a redacted key and diagnoses missing headless input/config", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "nanocodin-cli-"));
    process.env.NANOCODIN_HOME = await mkdtemp(path.join(os.tmpdir(), "nanocodin-home-"));
    delete process.env.MODEL_API_KEY; delete process.env.OPENAI_API_KEY; delete process.env.ANTHROPIC_API_KEY;
    const output = capture();
    expect(await runCli(["--print"], output.io, cwd, false)).toBe(1);
    expect(await runCli(["--print", "--prompt", "task"], output.io, cwd, false)).toBe(1);
    expect(output.stderr.join("\n")).toContain("模型配置不完整");
    process.env.MODEL_API_KEY = "secret-test-key";
    expect(await runCli(["--print-config"], output.io, cwd, false)).toBe(0);
    expect(output.stdout.join("\n")).not.toContain("secret-test-key");
    expect(output.stdout.join("\n")).toContain("(configured)");
    expect(await runCli(["--review"], output.io, cwd, false)).toBe(1);
    expect(await runCli(["--resume"], output.io, cwd, false)).toBe(1);
    expect(output.stderr.join("\n")).toContain("Checkpoint not found");
  });
  it("resolves symlinked executable entries and exports main", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "nanocodin-link-"));
    const real = path.join(cwd, "real.js"); const linked = path.join(cwd, "linked.js");
    await writeFile(real, ""); await symlink(real, linked);
    expect(isDirectExecution(pathToFileURL(real).href, linked)).toBe(true);
    expect(isDirectExecution(pathToFileURL(real).href, "")).toBe(false);
    expect(isDirectExecution(pathToFileURL(real).href, path.join(cwd, "missing"))).toBe(false);
    expect(typeof main).toBe("function");
  });
});
