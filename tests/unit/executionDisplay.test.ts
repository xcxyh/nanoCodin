import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createAgent, type AgentEvent, type ModelResponse, type Session, type ToolContext, type ToolOutputEvent } from "../../src/api.js";
import { buildMessages } from "../../src/agent/context.js";
import { DEFAULT_RUNTIME_CONFIG } from "../../src/core/runtimeConfig.js";
import { FileSessionStore } from "../../src/session/store.js";
import { createShellTool } from "../../src/tools/shell.js";
import { activityDetails, displayText, durationText, projectUi } from "../../src/ui/project.js";

const dirs: string[] = [];
const originalHome = process.env.NANOCODIN_HOME;
afterEach(async () => {
  if (originalHome === undefined) delete process.env.NANOCODIN_HOME; else process.env.NANOCODIN_HOME = originalHome;
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
async function fixture() { const cwd = await mkdtemp(path.join(os.tmpdir(), "nanocodin-display-")); dirs.push(cwd); return cwd; }
const done: ModelResponse = { text: "done" };
const session = (events: AgentEvent[]): Session => ({ version: 1, id: "fixture", cwd: process.cwd(), createdAt: 1, events });

describe("execution observations without a second session state", () => {
  it("pairs model requests and errors and round-trips the new events", async () => {
    const cwd = await fixture(); process.env.NANOCODIN_HOME = path.join(cwd, "home");
    const store = new FileSessionStore(cwd);
    const result = await createAgent({ cwd, save: (current) => store.save(current), model: { async generate() { throw new Error("network failure"); } } }).run("task");
    expect(result.status).toBe("error");
    expect(result.session.events).toMatchObject([
      { type: "user" }, { type: "model_start", round: 1 }, { type: "model_end", status: "error" }, { type: "finish", status: "error" }
    ]);
    const start = result.session.events[1] as Extract<AgentEvent, { type: "model_start" }>;
    expect(result.session.events[2]).toMatchObject({ requestId: start.requestId });
    expect(await store.load()).toEqual(result.session);
    expect(projectUi(result.session).model).toBeUndefined();
  });
  it("forwards live output with call IDs without saving it, tolerates observers, and ignores late output", async () => {
    let round = 0; let late: ToolContext["onOutput"];
    const progress: ToolOutputEvent[] = [];
    const save = vi.fn(async (_current: Session) => {});
    const result = await createAgent({ save, model: { async generate() { return ++round === 1 ? { text: "", toolCalls: [{ name: "live", input: {} }] } : done; } },
      tools: [{ name: "live", description: "fixture", schema: z.object({}), async execute(_input, context) {
        late = context.onOutput;
        context.onOutput?.({ stream: "stdout", text: "LIVE_ONLY" });
        context.onOutput?.({ stream: "stderr", text: "WARN_ONLY" });
        return { ok: true, output: "authoritative result" };
      } }]
    }).run("task", { async onProgress(event) { progress.push({ ...event }); event.text = "mutated"; throw new Error("broken viewer"); } });
    expect(result.status).toBe("complete");
    expect(progress.map((event) => event.stream)).toEqual(["stdout", "stderr"]);
    expect(result.session.events.find((event) => event.type === "tool_start")).toMatchObject({ callId: progress[0].callId });
    expect(save).toHaveBeenCalledTimes(result.session.events.length);
    expect(JSON.stringify(result.session)).not.toMatch(/LIVE_ONLY|WARN_ONLY|mutated/);
    expect(JSON.stringify(buildMessages(result.session, "instructions"))).toContain("authoritative result");
    late?.({ stream: "stdout", text: "late" }); expect(progress).toHaveLength(2);
  });
  it("ends model waiting on cancellation before any tool executes", async () => {
    const abort = new AbortController(); let started = false;
    const run = createAgent({ model: { async generate(_messages, options) {
      started = true;
      return new Promise((_resolve, reject) => options?.abortSignal?.addEventListener("abort", () => reject(new Error("cancelled")), { once: true }));
    } } }).run("task", { signal: abort.signal });
    await vi.waitFor(() => expect(started).toBe(true)); abort.abort();
    const result = await run;
    expect(result.status).toBe("cancelled");
    expect(result.session.events.find((event) => event.type === "model_end")).toMatchObject({ status: "cancelled" });
    expect(result.session.events.some((event) => event.type === "tool_start")).toBe(false);
  });
});

describe("bounded live shell output", () => {
  it("delivers stdout and stderr before command completion, flushes the final tail and isolates output observers", async () => {
    const cwd = await fixture(); const updates: Array<{ stream: string; text: string }> = [];
    let completed = false;
    const tool = createShellTool({ ...DEFAULT_RUNTIME_CONFIG.sandbox, defaultPolicy: "allow", maxOutputBytes: 128 });
    const running = tool.execute({ command: `node -e 'const fs=require("fs");console.log("READY");console.error("WARNING");const t=setInterval(()=>{if(fs.existsSync("release")){clearInterval(t);console.log("FINAL")}},20);setTimeout(()=>process.exit(4),4000).unref()'` }, {
      cwd, async onOutput(update) { updates.push(update); throw new Error("viewer failed"); }
    }).then((result) => { completed = true; return result; });
    await vi.waitFor(() => {
      expect(updates.some((update) => update.stream === "stdout" && update.text.includes("READY"))).toBe(true);
      expect(updates.some((update) => update.stream === "stderr" && update.text.includes("WARNING"))).toBe(true);
    });
    expect(completed).toBe(false);
    await writeFile(path.join(cwd, "release"), "go");
    const result = await running;
    expect(result.ok).toBe(true);
    expect(result.effects?.command).toMatchObject({ stdout: "READY\nFINAL", stderr: "WARNING", exitCode: 0 });
    expect(updates.some((update) => update.text.includes("FINAL"))).toBe(true);
    const count = updates.length; await new Promise((resolve) => setTimeout(resolve, 150)); expect(updates).toHaveLength(count);
  });
  it("bounds snapshots and final output in UTF-8 bytes for noisy commands", async () => {
    const cwd = await fixture(); const updates: string[] = [];
    const tool = createShellTool({ ...DEFAULT_RUNTIME_CONFIG.sandbox, defaultPolicy: "allow", maxOutputBytes: 128 });
    const result = await tool.execute({ command: `node -e 'process.stdout.write("中".repeat(20000));process.stderr.write("界".repeat(20000))'` }, { cwd, onOutput: (update) => updates.push(update.text) });
    expect(result.ok).toBe(true); expect(updates.length).toBeGreaterThan(0);
    for (const text of [...updates, result.effects!.command!.stdout, result.effects!.command!.stderr]) {
      expect(Buffer.byteLength(text)).toBeLessThanOrEqual(128); expect(text).not.toContain("�");
    }
  });
  it("flushes captured output and reason when cancelled, with no output after completion", async () => {
    const cwd = await fixture(); const abort = new AbortController(); const updates: string[] = [];
    const tool = createShellTool({ ...DEFAULT_RUNTIME_CONFIG.sandbox, defaultPolicy: "allow", maxOutputBytes: 128 });
    const result = await tool.execute({ command: `node -e 'console.log("PARTIAL");console.error("中".repeat(100));setTimeout(()=>{},5000)'` }, {
      cwd, signal: abort.signal, onOutput(update) { updates.push(update.text); if (update.text.includes("PARTIAL")) abort.abort(); }
    });
    expect(result).toMatchObject({ ok: false, reason: "cancelled", effects: { command: { stdout: "PARTIAL", exitCode: null } } });
    expect(result.effects?.command?.stderr).not.toContain("�");
    expect(Buffer.byteLength(result.effects!.command!.stderr)).toBeLessThanOrEqual(128);
    const count = updates.length; await new Promise((resolve) => setTimeout(resolve, 150)); expect(updates).toHaveLength(count);
  });
});

describe("timeline projection", () => {
  it("retains completed operations across turns and identifies historical interrupted work", () => {
    const saved = session([
      { at: 1, type: "user", text: "first", continuation: false },
      { at: 1000, type: "tool_start", callId: "a", call: { name: "view", input: { path: "a.ts" } } },
      { at: 2500, type: "tool_end", callId: "a", call: { name: "view", input: {} }, result: { ok: true, output: "read" } },
      { at: 3000, type: "tool_start", callId: "interrupted", call: { name: "create", input: { path: "b.ts" } }, mutates: true },
      { at: 4000, type: "user", text: "continue", continuation: true },
      { at: 5000, type: "model_start", requestId: "new", round: 1 }
    ]);
    const view = projectUi(saved, true);
    expect(view.activity.map((entry) => entry.status)).toEqual(["success", "interrupted"]);
    expect(durationText(view.activity[0], 9000)).toBe("1.5s");
    expect(durationText(view.activity[1], 9000)).toBe("");
    expect(view.model).toMatchObject({ requestId: "new", at: 5000 });
    expect(projectUi(saved, false).model).toBeUndefined();
  });
  it("keeps saved results visible beside large arguments, redacts sensitive keys and removes terminal controls", () => {
    const view = projectUi(session([{ at: 1, type: "tool_end", callId: "a", call: { name: "create", input: { apiKey: "secret-value", content: "x".repeat(30000) } }, result: { ok: false, output: "IMPORTANT ERROR" } }]));
    const details = activityDetails(view.activity[0]).join("\n");
    expect(details).toContain("IMPORTANT ERROR"); expect(details).toContain("[redacted]"); expect(details).not.toContain("secret-value");
    expect(details.length).toBeLessThan(17000);
    expect(displayText("\u001b[2J\u001b[31mERROR\u001b[0m\u0000")).toBe("ERROR");
  });
});
