import { mkdtemp, mkdir, readFile, writeFile, chmod, stat, symlink, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAgent, ToolRegistry, projectSession, requireVerification } from "../../src/api.js";
import { createDefaultTools } from "../../src/tools/index.js";
import { DEFAULT_RUNTIME_CONFIG } from "../../src/core/runtimeConfig.js";
import { buildContext } from "../../src/agent/context.js";
import { FileSessionStore } from "../../src/session/store.js";
import { loadProjectContext } from "../../src/context/project.js";
import { loadRuntimeConfig } from "../../src/config/load.js";
import { buildAiSdkToolSet } from "../../src/model/tools.js";
import { z } from "zod";
const dirs: string[] = []; const env = { ...process.env };
afterEach(async () => { process.env = { ...env }; await Promise.all(dirs.splice(0).map((p) => rm(p, { recursive: true, force: true }))); });
async function fixture() { const cwd = await mkdtemp(path.join(os.tmpdir(), "nanocodin-contract-")); dirs.push(cwd); process.env.NANOCODIN_HOME = path.join(cwd, "home"); return { cwd, registry: new ToolRegistry(createDefaultTools({ ...DEFAULT_RUNTIME_CONFIG.sandbox, defaultPolicy: "allow" })) }; }
describe("reliability contracts", () => {
  it("does not complete when cancelled during the finish hook", async () => {
    const abort = new AbortController(); let finish!: () => void; let enter!: () => void;
    const entered = new Promise<void>((resolve) => { enter = resolve; });
    const running = createAgent({ model: { async generate() { return { text: "done" }; } }, beforeFinish: async (_s, ctx) => { expect(ctx.signal).toBe(abort.signal); enter(); await new Promise<void>((resolve) => { finish = resolve; }); } }).run("task", { signal: abort.signal });
    await entered; abort.abort(); finish(); expect((await running).status).toBe("cancelled");
  });
  it("rejects invalid final types and treats content filtering as incomplete", async () => {
    const invalid = await createAgent({ maxSteps: 1, model: { async generate() { return { text: 'Action: final\nAction Input: {"answer":"blocked","incomplete":"true"}' }; } } }).run("task");
    expect(invalid.status).toBe("incomplete"); expect(invalid.session.events.some((e) => e.type === "notice")).toBe(true);
    const filtered = await createAgent({ model: { async generate() { return { text: "blocked", finishReason: "content-filter" }; } } }).run("task");
    expect(filtered.status).toBe("incomplete");
  });
  it("keeps special registered tool names in the advertised schema", () => {
    const tools = buildAiSdkToolSet([{ name: "__proto__", description: "fixture", schema: z.object({}), async execute() { return { ok: true, output: "ok" }; } }]);
    expect(Object.hasOwn(tools, "__proto__")).toBe(true);
  });
  it("fails closed on unknown permission values and does not flag read-only commands as edits", async () => {
    const { cwd } = await fixture();
    const registry = new ToolRegistry(createDefaultTools());
    const denied = await registry.execute("bash", { command: "echo unsafe" }, { cwd, ask: async () => "unexpected" as never });
    expect(denied.ok).toBe(false); expect(denied.reason).toBe("denied");
    await writeFile(path.join(cwd, "README.md"), "npm install\n");
    const allowed = new ToolRegistry(createDefaultTools({ ...DEFAULT_RUNTIME_CONFIG.sandbox, defaultPolicy: "allow" }));
    for (const command of ['rg -n "npm install" README.md', 'find . -name README.md -print 2>/dev/null']) {
      const result = await allowed.execute("bash", { command, purpose: "inspect" }, { cwd });
      expect(result.ok).toBe(true); expect(result.effects?.changed).not.toBe(true); expect(result.effects?.uncertainChanges).not.toBe(true);
    }
  });
  it("guards full rewrites, preserves permissions and never marks EEXIST as a change", async () => {
    const { cwd, registry } = await fixture(); const context = { cwd };
    await writeFile(path.join(cwd, "app.ts"), "original"); await chmod(path.join(cwd, "app.ts"), 0o755);
    const failed = await registry.execute("create", { path: "app.ts", content: "lost" }, context);
    expect(failed).toMatchObject({ ok: false, code: "FILE_EXISTS", effects: { changed: false, uncertainChanges: false } });
    const viewed = await registry.execute("view", { path: "app.ts" }, context);
    const hash = viewed.data!.hash;
    const rewritten = await registry.execute("str_replace", { path: "app.ts", mode: "rewrite", expectedHash: hash, newText: "new" }, context);
    expect(rewritten.ok).toBe(true); expect(await readFile(path.join(cwd, "app.ts"), "utf8")).toBe("new");
    expect((await stat(path.join(cwd, "app.ts"))).mode & 0o777).toBe(0o755);
    const conflict = await registry.execute("str_replace", { path: "app.ts", mode: "rewrite", expectedHash: hash, newText: "stale" }, context);
    expect(conflict).toMatchObject({ ok: false, code: "VERSION_CONFLICT", effects: { changed: false } });
    expect(await readFile(path.join(cwd, "app.ts"), "utf8")).toBe("new");
    expect((await readdir(cwd)).some((f) => f.endsWith(".tmp"))).toBe(false);
    expect((await registry.execute("str_replace", { path: "app.ts", mode: "rewrite", newText: "bad" }, context)).code).toBe("INVALID_INPUT");
  });
  it("retains the failure of a large attempted rewrite after many reads, without duplicate native results", async () => {
    const { cwd } = await fixture(); const events: any[] = [{ at: 1, type: "user", text: "task", continuation: false },
      { at: 2, type: "tool_end", callId: "failed", call: { name: "create", input: { path: "app.ts", content: "x".repeat(21214) } }, result: { ok: false, code: "FILE_EXISTS", output: "File already exists. Use str_replace." } }];
    for (let i = 0; i < 20; i++) events.push({ at: 3 + i, type: "tool_end", callId: `read-${i}`, call: { name: "view", input: { path: `other-${i}.ts` } }, result: { ok: true, output: "read ".repeat(1000) } });
    const context = buildContext({ version: 1, id: "fixture", cwd, createdAt: 1, events }, "rules", 4000);
    expect(context.messages.at(-1)!.content).toContain("FILE_EXISTS");
    expect(context.messages.at(-1)!.content.length).toBeLessThan(4500);
    const native = context.nativeMessages; const calls = native.filter((m) => m.toolCalls?.length).flatMap((m) => m.toolCalls!);
    const results = native.filter((m) => m.role === "tool");
    expect(calls.map((c) => c.id)).toEqual(results.map((r) => r.toolCallId));
    expect(JSON.stringify(native).length).toBeLessThan(6500);
    expect(results.some((r) => r.content.includes("FILE_EXISTS"))).toBe(true);
    expect(results.some((r) => r.content.includes("context clipped"))).toBe(true);
  });
  it("pins successful writes as well as errors under a small history budget", () => {
    const events: any[] = [{ at: 1, type: "user", text: "rewrite and verify", continuation: false }];
    for (const file of ["App.tsx", "styles.css"]) events.push({ at: 2, type: "tool_end", callId: `write-${file}`, call: { name: "str_replace", input: { path: file, newText: "x".repeat(3000) } }, result: { ok: true, output: `Replaced ${file}\nSHA256: ${"a".repeat(64)}`, effects: { changedFiles: [file] } } });
    for (let i = 0; i < 6; i++) events.push({ at: 3 + i, type: "tool_end", callId: `read-${i}`, call: { name: "view", input: { path: i % 2 ? "App.tsx" : "styles.css" } }, result: { ok: true, output: "read ".repeat(500) } });
    const context = buildContext({ version: 1, id: "fixture", cwd: process.cwd(), createdAt: 1, events }, "rules", 6000);
    expect(context.messages.at(-1)!.content).toContain("Replaced App.tsx");
    expect(context.messages.at(-1)!.content).toContain("Replaced styles.css");
    expect(context.messages.at(-1)!.content).toContain("Current changes verified: false");
  });
  it("supports symbol-link workspace identities and explicit corrupt-session diagnostics", async () => {
    const { cwd } = await fixture(); const actual = path.join(cwd, "real"), alias = path.join(cwd, "alias"); await mkdir(actual); await symlink(actual, alias);
    const agent = createAgent({ cwd: actual, model: { async generate() { return { text: "done" }; } } }); await agent.run("task");
    const store = new FileSessionStore(actual); await store.save(agent.session);
    const restored = await new FileSessionStore(alias).load(); expect(restored).toEqual(agent.session);
    expect(() => createAgent({ cwd: alias, session: restored!, model: { async generate() { return { text: "done" }; } } })).not.toThrow();
    const file = path.join(store.directory, `${agent.session.id}.json`); await writeFile(file, "broken");
    expect(await store.loadResult()).toMatchObject({ status: "corrupt" }); expect(await readFile(file, "utf8")).toBe("broken");
  });
  it("loads Unicode and namespaced skills and does not reuse another provider's identity", async () => {
    const { cwd } = await fixture(); const skills = path.join(cwd, ".agents", "skills");
    for (const name of ["中文技能", "fixture:skill"]) { const dir = path.join(skills, name); await mkdir(dir, { recursive: true }); await writeFile(path.join(dir, "SKILL.md"), `---\nname: ${name}\n---\nBODY_${name}`); }
    const context = await loadProjectContext(cwd, "$中文技能 /fixture:skill 执行"); expect(context.selectedSkills.map((s) => s.name).sort()).toEqual(["fixture:skill", "中文技能"].sort());
    expect((await loadProjectContext(cwd, "查看 /中文技能/file.ts")).selectedSkills).toEqual([]);
    for (const key of Object.keys(process.env)) if (/^(MODEL_|OPENAI_|ANTHROPIC_)/.test(key)) delete process.env[key];
    process.env.MODEL_PROVIDER = "anthropic"; process.env.ANTHROPIC_API_KEY = "fixture";
    const model = loadRuntimeConfig(cwd, []).config.model; expect(model.provider).toBe("anthropic"); expect(model.name).toBe("claude-haiku-4-5");
  });
});

it("keeps arbitrary interpreter side effects uncertain even when labeled inspect", async () => {
  const { cwd, registry } = await fixture();
  const result = await registry.execute("bash", { command: `node -e 'console.log(1)'`, purpose: "inspect" }, { cwd });
  expect(result.ok).toBe(true); expect(result.effects?.changed).not.toBe(true); expect(result.effects?.uncertainChanges).toBe(true);
});

it("does not cache a session approval without an explicit session identity", async () => {
  const { cwd } = await fixture(); let approvals = 0;
  const registry = new ToolRegistry(createDefaultTools());
  const context = { cwd, ask: async () => { approvals++; return "session" as never; } };
  await registry.execute("bash", { command: "echo first" }, context);
  await registry.execute("bash", { command: "echo second" }, context);
  expect(approvals).toBe(2);
});
