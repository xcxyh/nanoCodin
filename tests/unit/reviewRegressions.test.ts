import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgent, projectSession, requireVerification, type Session } from "../../src/api.js";
import { buildMessages } from "../../src/agent/context.js";
import { createModelProvider } from "../../src/model/provider.js";
import { FileSessionStore } from "../../src/session/store.js";
import { formatSessionReview } from "../../src/session/review.js";

const temporary: string[] = [];
const originalEnv = { ...process.env };
afterEach(async () => {
  vi.unstubAllGlobals(); process.env = { ...originalEnv };
  await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
async function fixture() {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "nanocodin-regression-")); temporary.push(cwd);
  process.env.NANOCODIN_HOME = path.join(cwd, "home");
  return { cwd, store: new FileSessionStore(cwd) };
}
function session(): Session { return { version: 1, id: "fixture", cwd: process.cwd(), createdAt: 1, events: [] }; }
const check = (id: string) => ({ at: 1, type: "tool_end" as const, callId: id, call: { name: "check", input: {} }, result: { ok: true, output: "passed", effects: { command: { command: "test", exitCode: 0, stdout: "passed", stderr: "", durationMs: 1, verification: true } } } });

describe("review regressions: sessions and context", () => {
  it("estimates missing usage from the real SDK and round-trips the completed session", async () => {
    const { cwd, store } = await fixture();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      id: "fixture", object: "chat.completion", created: 1, model: "fixture",
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "done" } }]
    }), { headers: { "Content-Type": "application/json" } })));
    const model = createModelProvider({ provider: "openai", name: "fixture", apiKey: "fixture", baseUrl: "https://fixture.invalid/v1" });
    const result = await createAgent({ cwd, model, save: (current) => store.save(current) }).run("hello");
    expect(result.status).toBe("complete");
    expect(projectSession(result.session).usage).toMatchObject({ source: "estimated" });
    expect(Number.isFinite(projectSession(result.session).usage!.totalTokens)).toBe(true);
    expect(await store.load()).toEqual(result.session);
  });
  it("retains tools and finish when an older file contains null token counts", async () => {
    const { cwd, store } = await fixture();
    const agent = createAgent({ cwd, model: { async generate() { return { text: "done" }; } } });
    await agent.run("task"); const saved = agent.session; await store.save(saved);
    const file = path.join(store.directory, `${saved.id}.json`);
    const raw = JSON.parse(await readFile(file, "utf8"));
    raw.events.splice(1, 0, { at: 1, type: "usage", usage: { promptTokens: null, completionTokens: null, totalTokens: null, source: "actual" } });
    await writeFile(file, JSON.stringify(raw));
    const restored = await store.load();
    expect(restored?.events.filter((event) => event.type !== "notice")).toEqual(saved.events);
    expect(formatSessionReview(restored!)).toContain("状态：complete");
    expect(restored?.events.some((event) => event.type === "notice" && event.text.includes("无效 token"))).toBe(true);
  });
  it("keeps unresolved writes by call ID, invalidates old checks and accepts fresh checks", async () => {
    const saved = session();
    saved.events.push({ at: 1, type: "user", text: "task", continuation: false }, check("before"),
      { at: 2, type: "tool_start", callId: "write", call: { name: "custom_write", input: {} }, mutates: true },
      { at: 3, type: "tool_start", callId: "read", call: { name: "read", input: {} }, mutates: false },
      { at: 4, type: "tool_end", callId: "read", call: { name: "read", input: {} }, result: { ok: true, output: "inspected" } });
    expect(projectSession(saved)).toMatchObject({ changed: true, verified: false, pending: { callId: "write" } });
    expect(requireVerification(saved)).toContain("Verification required");
    const result = await createAgent({ session: saved, beforeFinish: requireVerification, maxSteps: 1, model: { async generate() { return { text: "done" }; } } }).run("continue", { continuation: true });
    expect(result.status).toBe("incomplete");
    saved.events.push(check("after"));
    expect(requireVerification(saved)).toBeUndefined();
    expect(projectSession(saved).pending?.callId).toBe("write");
    // Older version-1 records have no mutates field and remain conservative.
    delete (saved.events[2] as Extract<Session["events"][number], { type: "tool_start" }>).mutates;
    saved.events.pop(); expect(requireVerification(saved)).toContain("Verification required");
  });
  it("resets task acceptance while retaining all changes in the read-only review", async () => {
    const saved = session(); saved.events.push(
      { at: 1, type: "user", text: "edit task", continuation: false },
      { at: 2, type: "tool_end", callId: "write", call: { name: "write", input: {} }, result: { ok: true, output: "written", effects: { changedFiles: ["old.ts"], plan: [{ text: "old plan", status: "pending" }], verificationCommands: ["test"] } } },
      { at: 3, type: "finish", status: "incomplete", answer: "cannot check" });
    const agent = createAgent({ session: saved, beforeFinish: requireVerification, maxSteps: 2, model: { async generate() { return { text: "read-only answer" }; } } });
    const continuation = await agent.run("continue", { continuation: true });
    expect(continuation.status).toBe("incomplete");
    const result = await agent.run("explain something without editing");
    expect(result.status).toBe("complete");
    expect(projectSession(result.session)).toMatchObject({ changed: false, checks: {}, files: [], plan: [], missingChecks: [] });
    expect(formatSessionReview(result.session)).toContain("文件改动：old.ts");
  });
  it("pins the latest actual task across repeated continuations", () => {
    const saved = session(); saved.events.push({ at: 1, type: "user", text: "old task", continuation: false },
      { at: 2, type: "finish", status: "complete", answer: "done" }, { at: 3, type: "user", text: "current task requirements", continuation: false });
    for (let i = 0; i < 6; i++) saved.events.push({ at: 4, type: "finish", status: "incomplete", answer: "budget" }, { at: 5, type: "user", text: "continue", continuation: true });
    expect(buildMessages(saved, "instructions").some((message) => message.content === "current task requirements")).toBe(true);
  });
  it.each([true, false])("retains the latest tool outcome before clipping large arguments (ok=%s)", (ok) => {
    const saved = session(); saved.events.push({ at: 1, type: "user", text: "task", continuation: false },
      { at: 2, type: "tool_end", callId: "create", call: { name: "create", input: { content: "x".repeat(5000) } }, result: { ok, output: ok ? "Created: file.ts" : "EEXIST: file.ts" } });
    const prompt = buildMessages(saved, "instructions", 1000).at(-1)!.content;
    expect(prompt).toContain(ok ? "OK: Created: file.ts" : "ERROR: EEXIST: file.ts");
    expect(prompt.length).toBeLessThan(1300);
    expect(saved.events).toHaveLength(2);
  });
  it("keeps fresh results visible beside an unresolved call with large arguments", () => {
    const saved = session(); saved.events.push({ at: 1, type: "user", text: "task", continuation: false },
      { at: 2, type: "tool_start", callId: "crashed", call: { name: "write", input: { content: "x".repeat(5000) } }, mutates: true }, check("fresh"));
    const prompt = buildMessages(saved, "instructions", 1000).at(-1)!.content;
    expect(prompt).toContain("OK: passed");
    expect(prompt).toContain("do not automatically replay writes");
  });
  it.each(["npm test || true", "! npm test", "coproc npm test"])("does not trust historical shell control checks: %s", (command) => {
    const saved = session();
    const old = check("old"); old.result.effects.command.command = command;
    saved.events.push({ at: 1, type: "tool_end", callId: "write", call: { name: "write", input: {} }, result: { ok: true, output: "written", effects: { changedFiles: ["a.ts"] } } }, old);
    expect(projectSession(saved).verified).toBe(false);
    expect(requireVerification(saved)).toContain("Verification required");
    saved.events.push(check("fresh")); expect(requireVerification(saved)).toBeUndefined();
  });
  it("does not accept a check recorded in the same effect as a mutation", () => {
    const saved = session(); const event = check("mixed");
    saved.events.push({ ...event, result: { ...event.result, effects: { ...event.result.effects, changed: true } } });
    expect(requireVerification(saved)).toContain("Verification required");
    saved.events.push(check("fresh")); expect(requireVerification(saved)).toBeUndefined();
  });
});
