import { renameSync } from "node:fs";
import { mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAgent } from "../../src/api.js";
import { FileSessionStore } from "../../src/session/store.js";
import { formatSessionReview } from "../../src/session/review.js";
import { projectUi } from "../../src/ui/project.js";
import type { Session } from "../../src/agent/session.js";

const originalEnv = { ...process.env };
afterEach(() => { process.env = { ...originalEnv }; });
async function fixture() {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "nanocodin-session-"));
  process.env.NANOCODIN_HOME = await mkdtemp(path.join(os.tmpdir(), "nanocodin-home-"));
  return { cwd, store: new FileSessionStore(cwd) };
}

describe("optional file session adapter", () => {
  it("saves the single event history atomically and retains successful sessions", async () => {
    const { cwd, store } = await fixture();
    const agent = createAgent({ cwd, model: { async generate() { return { text: "完成" }; } }, save: (session) => store.save(session) });
    await agent.run("任务");
    const saved = await store.load();
    expect(saved).toEqual(agent.session);
    expect((await store.list())).toEqual([{ id: saved!.id, task: "任务" }]);
    expect((await readdir(store.directory)).some((file) => file.endsWith(".tmp"))).toBe(false);
    expect((await stat(path.join(store.directory, `${saved!.id}.json`))).mode & 0o777).toBe(0o600);
    const resumed = createAgent({ cwd, session: saved!, model: { async generate(messages) { return { text: messages.some((message) => message.content === "任务") ? "有上下文" : "无上下文" }; } } });
    expect((await resumed.run("continue", { continuation: true })).answer).toBe("有上下文");
  });
  it("keeps separate new sessions and reads named sessions", async () => {
    const { cwd, store } = await fixture();
    const agent = createAgent({ cwd, model: { async generate() { return { text: "完成" }; } }, save: (session) => store.save(session) });
    await agent.run("one"); const one = agent.session.id;
    agent.reset(); await agent.run("two");
    expect((await store.list())).toHaveLength(2);
    expect((await store.load(one))?.events[0]).toMatchObject({ text: "one" });
    expect((await store.load())?.id).toBe(agent.session.id);
  });
  it("rejects traversal, corrupt records and sessions from a different cwd", async () => {
    const { cwd, store } = await fixture();
    expect(await store.load("../outside")).toBeNull();
    const agent = createAgent({ cwd, model: { async generate() { return { text: "ok" }; } } });
    await agent.run("task"); await store.save(agent.session);
    const file = path.join(store.directory, `${agent.session.id}.json`);
    await writeFile(file, "broken"); expect(await store.load(agent.session.id)).toBeNull();
    await writeFile(file, JSON.stringify({ ...agent.session, events: [{ type: "unknown" }] })); expect(await store.load(agent.session.id)).toBeNull();
    await expect(store.save({ ...agent.session, cwd: path.join(cwd, "different") })).rejects.toThrow("workspace");
    expect(await new FileSessionStore(path.join(cwd, "different")).list()).toEqual([]);
  });
  it("can review and render interrupted operations with truthful status", async () => {
    const { cwd } = await fixture();
    const session: Session = { version: 1, id: "demo", cwd, createdAt: 1, events: [
      { type: "user", at: 1, text: "修复", continuation: false },
      { type: "tool_start", at: 2, callId: "a", call: { name: "create", input: { path: "a.ts" } } },
      { type: "tool_end", at: 3, callId: "a", call: { name: "create", input: {} }, result: { ok: true, output: "created", effects: { changedFiles: ["a.ts"] } } },
      { type: "tool_end", at: 4, callId: "b", call: { name: "bash", input: {} }, result: { ok: false, output: "failed", effects: { command: { command: "npm test", exitCode: 1, stdout: "", stderr: "failed", durationMs: 1, verification: true } } } },
      { type: "tool_start", at: 5, callId: "c", call: { name: "bash", input: { command: "unfinished" } } }
    ] };
    expect(formatSessionReview(session)).toContain("状态：interrupted");
    expect(formatSessionReview(session)).toContain("exit=1: npm test");
    expect(formatSessionReview(session)).toContain("文件改动：a.ts");
    expect(formatSessionReview(session)).toContain("中断操作");
    session.events.push({ type: "finish", at: 6, status: "error", answer: "真实失败" });
    expect(projectUi(session).turns[0]).toEqual({ user: "修复", status: "error", answer: "真实失败" });
    expect(projectUi(session).activity.some((activity) => activity.failed)).toBe(true);
  });
});

it("continues a v1 snapshot and reads complete journal lines after an interrupted append", async () => {
  const { createAgentRuntime } = await import("../../src/agent/run.js");
  const { appendFile, mkdir } = await import("node:fs/promises");
  const { store, cwd } = await fixture();
  const base: Session = { version: 1, id: "v1", createdAt: 1, cwd, events: [
    { at: 1, type: "user", text: "old task", continuation: false }
  ] };
  await mkdir(store.directory, { recursive: true });
  const snapshot = path.join(store.directory, "v1.json");
  await writeFile(snapshot, JSON.stringify(base));
  const agent = createAgentRuntime({ session: (await store.load("v1"))!, model: {
    async generate() { return { text: "done" }; }
  } }, { append: store.writer() });
  await agent.run("continue", { continuation: true });
  const journal = path.join(store.directory, "v1.journal");
  const [segment] = await readdir(journal);
  await appendFile(path.join(journal, segment), '{"at":');
  expect(await store.load()).toEqual(agent.session);
  const next = await agent.run("next task");
  expect(next.persistenceError).toBeUndefined();
  expect(await store.load()).toEqual(next.session);
  expect(await readFile(snapshot, "utf8")).toBe(JSON.stringify(base));
  const oldWriter = createAgentRuntime({ session: base, model: { async generate() { throw Error("unexpected model call"); } } }, { append: store.writer() });
  const conflict = await oldWriter.run("stale task");
  expect(conflict.status).toBe("error");
  expect(conflict.persistenceError).toContain("Reload");
  expect(await store.load()).toEqual(next.session);
});

it("releases an interrupted journal when persistence fails while the process stays alive", async () => {
  const { createAgentRuntime } = await import("../../src/agent/run.js");
  const { rename } = await import("node:fs/promises");
  const { cwd, store } = await fixture();
  let journal = "";
  const agent = createAgentRuntime({ cwd, model: {
    async generate() {
      journal = path.join(store.directory, agent.session.id + ".journal");
      await rename(journal, journal + ".offline");
      return { text: "done" };
    }
  } }, { append: store.writer() });
  // Restore the disk after the first failed append, before the final event.
  const result = await agent.run("task", { onEvent(event) {
    if (event.type === "notice" && event.kind === "persistence") {
      // Synchronous rename makes the simulated recovery visible before finish is recorded.
      renameSync(journal + ".offline", journal);
    }
  } });
  expect(result.persistenceError).toBeTruthy();
  const prior = (await store.load())!;
  const next = createAgentRuntime({ session: prior, model: { async generate() { return { text: "resumed" }; } } }, { append: store.writer() });
  expect(await next.run("continue", { continuation: true })).toMatchObject({ status: "complete", persistenceError: undefined });
});
