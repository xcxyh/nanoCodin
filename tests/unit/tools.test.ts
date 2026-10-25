import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createAgent, projectSession } from "../../src/api.js";
import { ToolRegistry } from "../../src/tools/registry.js";
import { createDefaultTools } from "../../src/tools/index.js";
import { createShellTool, decidePolicy, isWriteCommand } from "../../src/tools/shell.js";
import { DEFAULT_RUNTIME_CONFIG } from "../../src/core/runtimeConfig.js";
import type { ToolContext } from "../../src/core/toolTypes.js";

async function fixture() {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "nanocodin-tools-"));
  return { cwd, context: { cwd } as ToolContext, tools: new ToolRegistry(createDefaultTools()) };
}
const shellConfig = () => structuredClone(DEFAULT_RUNTIME_CONFIG.sandbox);

describe("eight default tools", () => {
  it("keeps a single explicit tool inventory", () => {
    expect(createDefaultTools().map((tool) => tool.name)).toEqual(["ls", "grep", "view", "create", "str_replace", "bash", "todo", "ask_user_question"]);
  });
  it("reads with line bounds, validates paths and searches single files", async () => {
    const { cwd, context, tools } = await fixture();
    await writeFile(path.join(cwd, "sample.ts"), Array.from({ length: 500 }, (_, i) => `line-${i + 1}`).join("\n"));
    expect((await tools.execute("view", {}, context)).ok).toBe(false);
    const result = await tools.execute("view", { path: "sample.ts", startLine: 201, endLine: 205 }, context);
    expect(result.output).toContain("201: line-201");
    expect(result.output).not.toContain("206: line-206");
    expect(result.effects).toBeUndefined();
    expect((await tools.execute("view", { path: "sample.ts", startLine: 5, endLine: 2 }, context)).ok).toBe(false);
    expect((await tools.execute("grep", { pattern: "line-499", path: "sample.ts" }, context)).output).toContain("sample.ts:499:");
    expect((await tools.execute("grep", { pattern: "absent", path: "sample.ts" }, context)).output).toBe("No matches found.");
  });
  it("skips generated content and supports file-extension filters", async () => {
    const { cwd, context, tools } = await fixture();
    await mkdir(path.join(cwd, "node_modules"));
    await writeFile(path.join(cwd, "node_modules", "hidden.ts"), "needle");
    await writeFile(path.join(cwd, "real.ts"), "needle");
    await writeFile(path.join(cwd, "other.md"), "needle");
    expect((await tools.execute("ls", {}, context)).output).not.toContain("node_modules");
    const found = await tools.execute("grep", { pattern: "needle", fileExtension: ".ts" }, context);
    expect(found.output).toContain("real.ts:1:");
    expect(found.output).not.toMatch(/hidden|other/);
  });
  it("never overwrites an existing file and requires intentional multi-match edits", async () => {
    const { cwd, context, tools } = await fixture();
    const created = await tools.execute("create", { path: "nested/a.ts", content: "same\nsame" }, context);
    expect(created.effects?.changedFiles).toEqual(["nested/a.ts"]);
    expect((await tools.execute("create", { path: "nested/a.ts", content: "overwrite" }, context)).ok).toBe(false);
    const ambiguous = await tools.execute("str_replace", { path: "nested/a.ts", oldText: "same", newText: "other" }, context);
    expect(ambiguous.ok).toBe(false);
    expect(await readFile(path.join(cwd, "nested/a.ts"), "utf8")).toBe("same\nsame");
    expect((await tools.execute("str_replace", { path: "nested/a.ts", oldText: "missing", newText: "other" }, context)).ok).toBe(false);
    const replaced = await tools.execute("str_replace", { path: "nested/a.ts", oldText: "same", newText: "other", replaceAll: true }, context);
    expect(replaced.ok).toBe(true);
    expect(await readFile(path.join(cwd, "nested/a.ts"), "utf8")).toBe("other\nother");
  });
  it("returns plans as effects instead of mutating agent state", async () => {
    const { context, tools } = await fixture();
    const result = await tools.execute("todo", { items: [{ text: "read", status: "in_progress" }], verificationCommands: ["npm test"] }, context);
    expect(result.effects?.plan).toEqual([{ text: "read", status: "in_progress" }]);
    expect(Object.keys(context)).toEqual(["cwd"]);
    expect((await tools.execute("todo", { operation: "create_todo_list" }, context)).ok).toBe(false);
  });
  it("routes questions through an injected callback and explains headless limitations", async () => {
    const { context, tools } = await fixture();
    const input = { title: "选择", options: [{ value: "a", label: "A" }] };
    expect((await tools.execute("ask_user_question", input, context)).ok).toBe(false);
    context.ask = async (request) => request.options[0].value;
    expect((await tools.execute("ask_user_question", input, context)).output).toBe("User selected: a");
  });
});

describe("shell execution and policy", () => {
  it("does not let allow prefixes authorize compound commands or similarly named executables", () => {
    const config = shellConfig();
    expect(decidePolicy("ls", config)).toBe("allow");
    expect(decidePolicy("ls && touch a", config)).toBe("ask");
    expect(decidePolicy("lsbad", config)).toBe("ask");
    expect(decidePolicy('rg "needle.*" src', config)).toBe("allow");
    expect(decidePolicy("git push origin main", config)).toBe("ask");
    expect(decidePolicy("rm -rf /", config)).toBe("deny");
  });
  it("ignores model-supplied confirmed flags and denies approval in headless mode", async () => {
    const { context } = await fixture();
    const registry = new ToolRegistry([createShellTool(shellConfig())]);
    const result = await registry.execute("bash", { command: "echo test", confirmed: true }, context);
    expect(result.ok).toBe(false);
    expect(result.output).toContain("approval");
  });
  it("records real exit codes and bounded output including failing checks", async () => {
    const { context } = await fixture();
    const config = shellConfig(); config.defaultPolicy = "allow"; config.maxOutputBytes = 100;
    const registry = new ToolRegistry([createShellTool(config)]);
    const success = await registry.execute("bash", { command: `node -e "console.log('0 errors')"`, purpose: "verify" }, context);
    expect(success.ok).toBe(true);
    expect(success.effects?.command).toMatchObject({ exitCode: 0, stdout: "0 errors", verification: true });
    const failed = await registry.execute("bash", { command: `node -e "console.log('x'.repeat(500)); process.exit(3)"`, purpose: "verify" }, context);
    expect(failed.ok).toBe(false);
    expect(failed.effects?.command?.exitCode).toBe(3);
    expect(failed.effects?.command?.stdout.length).toBeLessThanOrEqual(100);
  });
  it("honors one-off and session approvals and keeps deny rules active", async () => {
    const { context } = await fixture();
    let count = 0;
    context.ask = async (request) => { count++; return request.options[1].value; };
    const registry = new ToolRegistry([createShellTool(shellConfig())]);
    expect((await registry.execute("bash", { command: "echo first" }, context)).ok).toBe(true);
    expect((await registry.execute("bash", { command: "echo second" }, context)).ok).toBe(true);
    expect(count).toBe(1);
    expect((await registry.execute("bash", { command: "rm -rf /" }, context)).ok).toBe(false);
  });
  it("does not carry session approval across an agent reset", async () => {
    let approvals = 0;
    let round = 0;
    const agent = createAgent({
      tools: [createShellTool(shellConfig())],
      ask: async (request) => { approvals++; return request.options[1].value; },
      model: { async generate() {
        round++;
        return round % 2 ? { text: "", toolCalls: [{ name: "bash", input: { command: "echo approved" } }] } : { text: "done" };
      } }
    });
    await agent.run("one"); agent.reset(); await agent.run("two");
    expect(approvals).toBe(2);
  });
  it("cancels an active command and does not hang", async () => {
    const { context } = await fixture();
    const config = shellConfig(); config.defaultPolicy = "allow";
    const registry = new ToolRegistry([createShellTool(config)]);
    const abort = new AbortController(); context.signal = abort.signal;
    const running = registry.execute("bash", { command: `node -e "setTimeout(() => {}, 10000)"` }, context);
    setTimeout(() => abort.abort(), 40);
    const result = await running;
    expect(result.ok).toBe(false);
    expect(result.output).toBe("Command cancelled.");
  });
  it("cancels approval waiting without recording a phantom workspace change", async () => {
    const { context } = await fixture();
    const abort = new AbortController();
    const result = createAgent({
      cwd: context.cwd, tools: [createShellTool(shellConfig())],
      model: { async generate() { return { text: "", toolCalls: [{ name: "bash", input: { command: "echo test" } }] }; } },
      ask: async (_request, signal) => new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(new Error("cancelled")), { once: true }))
    }).run("执行命令", { signal: abort.signal });
    setTimeout(() => abort.abort(), 20);
    const stopped = await result;
    expect(stopped.status).toBe("cancelled");
    expect(projectSession(stopped.session).changed).toBe(false);
  });
  it("reports timeouts with command evidence", async () => {
    const { context } = await fixture();
    const config = shellConfig(); config.defaultPolicy = "allow";
    const registry = new ToolRegistry([createShellTool(config)]);
    const result = await registry.execute("bash", { command: `node -e "setTimeout(() => {}, 10000)"`, timeoutMs: 1000 }, context);
    expect(result.ok).toBe(false);
    expect(result.output).toContain("timed out");
    expect(result.effects?.command?.exitCode).toBeNull();
  });
});


describe("review regressions: shell boundaries", () => {
  it("requires approval for executable utilities even when an old config allows their prefixes", async () => {
    const { cwd, context } = await fixture();
    await writeFile(path.join(cwd, "victim.txt"), "valuable");
    for (const command of ["find victim.txt -delete", "sed -n 'w copy.txt' victim.txt", "awk 'BEGIN {print 1}'", "rg --pre=sh needle victim.txt", "git diff --output=copy.txt", "tree -o copy.txt", 'rg --pr\\e=sh needle victim.txt', 'rg --pr""e=sh needle victim.txt', 'git diff --out""put=copy.txt', 'git diff --out{pu,pu}t=copy.txt', 'rg needle *']) {
      const result = await createShellTool(shellConfig()).execute({ command }, context);
      expect(result.ok).toBe(false); expect(result.output).toContain("approval");
    }
    expect(await readFile(path.join(cwd, "victim.txt"), "utf8")).toBe("valuable");
    expect(isWriteCommand('git diff --out""put=copy.txt')).toBe(true);
    expect(isWriteCommand('rg --pr\\e=sh needle victim.txt')).toBe(true);
    expect(isWriteCommand("find victim.txt -delete")).toBe(true);
    expect(isWriteCommand("sed -n 'w copy.txt' victim.txt")).toBe(true);
    context.ask = async () => "once" as never;
    const approved = await createShellTool(shellConfig()).execute({ command: "sed -n 'w copy.txt' victim.txt" }, context);
    expect(approved.effects?.changed).toBe(true);
    expect(await readFile(path.join(cwd, "copy.txt"), "utf8")).toBe("valuable\n");
  });
  it("does not record masked failures or checks preceding an edit as verification", async () => {
    const { cwd, context } = await fixture();
    await writeFile(path.join(cwd, "package.json"), JSON.stringify({ scripts: { test: "exit 9" } }));
    const tool = createShellTool({ ...shellConfig(), defaultPolicy: "allow" });
    for (const command of ["npm test; true", "npm test || true", "npm test | cat", "npm test &", "! npm test", "coproc npm test", 'npm test "$(true)"']) {
      const result = await tool.execute({ command, purpose: "verify" }, context);
      expect(result.effects?.command?.verification).toBe(false);
    }
    await writeFile(path.join(cwd, "package.json"), JSON.stringify({ scripts: { test: "exit 0" } }));
    const mixed = await tool.execute({ command: "npm test && printf bad > result.txt", purpose: "edit" }, context);
    expect(mixed.effects).toMatchObject({ changed: true, command: { verification: false } });
    const plain = await tool.execute({ command: "npm test" }, context);
    expect(plain.effects?.command).toMatchObject({ verification: true, exitCode: 0 });
    const quoted = await tool.execute({ command: `node -e 'console.log("a; b && c")'`, purpose: "verify" }, context);
    expect(quoted.effects?.command).toMatchObject({ verification: true, exitCode: 0 });
  });
  it.each(["cancel", "timeout"])("stops shell children and preserves partial logs on %s", async (mode) => {
    const { cwd, context } = await fixture();
    const abort = new AbortController(); context.signal = abort.signal;
    const tool = createShellTool({ ...shellConfig(), defaultPolicy: "allow" });
    // The trailing command prevents bash's single-command exec optimization.
    const command = `node -e 'console.log("CHILD_READY"); console.error("PART_A_DONE"); require("fs").writeFileSync("ready.txt","ready"); setTimeout(()=>require("fs").writeFileSync("late.txt","bad"),1800)'; true`;
    const running = tool.execute({ command, purpose: "edit", timeoutMs: mode === "cancel" ? 5000 : 1000 }, context);
    if (mode === "cancel") {
      await vi.waitFor(async () => expect(await readFile(path.join(cwd, "ready.txt"), "utf8")).toBe("ready"));
      abort.abort();
    }
    const result = await running;
    expect(result.ok).toBe(false);
    expect(result.effects?.command).toMatchObject({ exitCode: null, stdout: "CHILD_READY" });
    expect(result.effects?.command?.stderr).toContain("PART_A_DONE");
    expect(result.output).toContain("CHILD_READY");
    expect(result.output).toContain("PART_A_DONE");
    expect(result.effects?.command?.stderr).toContain(mode === "cancel" ? "cancelled" : "timed out");
    await new Promise((resolve) => setTimeout(resolve, 1900));
    await expect(readFile(path.join(cwd, "late.txt"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  }, 6000);
  it("force-stops a child that ignores SIGTERM", async () => {
    const { cwd, context } = await fixture();
    const abort = new AbortController(); context.signal = abort.signal;
    const tool = createShellTool({ ...shellConfig(), defaultPolicy: "allow" });
    const command = `node -e 'process.on("SIGTERM",()=>{}); require("fs").writeFileSync("ready.txt","ready"); setTimeout(()=>require("fs").writeFileSync("late.txt","bad"),1400)'; true`;
    const running = tool.execute({ command, purpose: "edit", timeoutMs: 5000 }, context);
    await vi.waitFor(async () => expect(await readFile(path.join(cwd, "ready.txt"), "utf8")).toBe("ready"));
    abort.abort();
    expect((await running).ok).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await expect(readFile(path.join(cwd, "late.txt"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  }, 6000);
});
