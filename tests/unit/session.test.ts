import { mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAgent } from "../../src/api.js";
import { FileSessionStore } from "../../src/session/store.js";
import { formatSessionReview } from "../../src/session/review.js";
import { projectUi } from "../../src/ui/project.js";
import type { Session } from "../../src/session/types.js";

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
