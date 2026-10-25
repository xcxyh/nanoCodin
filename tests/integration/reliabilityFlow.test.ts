import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, expect, it } from "vitest";
import { createAgent, projectSession, requireVerification } from "../../src/api.js";
import { createModelProvider } from "../../src/model/provider.js";
import { createDefaultTools } from "../../src/tools/index.js";
import { DEFAULT_RUNTIME_CONFIG } from "../../src/core/runtimeConfig.js";
import { FileSessionStore } from "../../src/session/store.js";
const oldHome = process.env.NANOCODIN_HOME;
afterEach(() => { if (oldHome === undefined) delete process.env.NANOCODIN_HOME; else process.env.NANOCODIN_HOME = oldHome; });
function reply(response: any, name: string, input: unknown) {
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify({ id: "fixture", object: "chat.completion", created: 1, model: "fixture", choices: [{ index: 0, finish_reason: "tool_calls", message: { role: "assistant", content: null,
    tool_calls: [{ id: "call_fixture", type: "function", function: { name, arguments: JSON.stringify(input) } }] } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }));
}
async function fixture(handler: (body: any, response: any, round: number) => void) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "nanocodin-http-reliability-")); process.env.NANOCODIN_HOME = path.join(cwd, "home");
  let round = 0; const requests: any[] = [];
  const server = createServer(async (request, response) => {
    let raw = ""; for await (const chunk of request) raw += String(chunk);
    const body = JSON.parse(raw); requests.push(body); handler(body, response, ++round);
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening"); const address = server.address() as { port: number };
  const model = createModelProvider({ provider: "openai", name: "fixture", apiKey: "fixture", baseUrl: `http://127.0.0.1:${address.port}/v1`, requestTimeoutMs: 200, idleTimeoutMs: 80, maxRetries: 1 });
  const store = new FileSessionStore(cwd); const tools = () => createDefaultTools({ ...DEFAULT_RUNTIME_CONFIG.sandbox, defaultPolicy: "allow" });
  return { cwd, requests, model, store, tools, async close() { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); await rm(cwd, { recursive: true, force: true }); } };
}
it("rewrites an existing file through the actual SDK/native tool protocol and verifies it", async () => {
  const fx = await fixture((body, response, round) => {
    if (round === 1) reply(response, "view", { path: "landing.js" });
    else if (round === 2) {
      const output = body.messages.filter((m: any) => m.role === "tool").at(-1).content;
      const hash = output.match(/SHA256: ([a-f0-9]{64})/)[1];
      reply(response, "str_replace", { path: "landing.js", mode: "rewrite", expectedHash: hash, newText: 'export const title = "New landing";\n' });
    } else if (round === 3) reply(response, "bash", { command: "npm run build", purpose: "verify" });
    else reply(response, "final", { answer: "已改写，构建通过。" });
  });
  try {
    await writeFile(path.join(fx.cwd, "landing.js"), 'export const title = "Old";\n');
    await writeFile(path.join(fx.cwd, "package.json"), JSON.stringify({ type: "module", scripts: { build: "node --check landing.js" } }));
    const result = await createAgent({ cwd: fx.cwd, model: fx.model, tools: fx.tools(), save: (s) => fx.store.save(s), beforeFinish: requireVerification }).run("rewrite and build");
    expect(result.status).toBe("complete"); expect(await readFile(path.join(fx.cwd, "landing.js"), "utf8")).toContain("New landing");
    expect(projectSession(result.session)).toMatchObject({ changed: true, verified: true, uncertainChanges: false });
    for (const body of fx.requests) for (let i = 0; i < body.messages.length; i++) if (body.messages[i].role === "tool") {
      expect(body.messages[i - 1].tool_calls.some((call: any) => call.id === body.messages[i].tool_call_id)).toBe(true);
    }
  } finally { await fx.close(); }
}, 10000);
it("times out a connected slow body, persists its cause, and resumes without replaying the prior write", async () => {
  const fx = await fixture((_body, response, round) => {
    if (round === 1) reply(response, "create", { path: "created.js", content: 'export const a = 1;\n' });
    else if (round === 2) {
      response.setHeader("Content-Type", "application/json"); response.write(" ");
      const timer = setInterval(() => response.write(" "), 10); response.on("close", () => clearInterval(timer));
    } else if (round === 3) reply(response, "bash", { command: "node --check created.js", purpose: "verify" });
    else reply(response, "final", { answer: "恢复完成。" });
  });
  try {
    const agent = createAgent({ cwd: fx.cwd, model: fx.model, tools: fx.tools(), save: (s) => fx.store.save(s), beforeFinish: requireVerification });
    const first = await agent.run("create and check"); expect(first.status).toBe("error"); expect(first.failure).toMatchObject({ kind: "timeout", timeoutScope: "total", attempts: 1 });
    expect(first.answer).not.toContain("API key"); expect(first.failure!.receivedBytes).toBeGreaterThan(0);
    const saved = await fx.store.load(); expect(saved?.events.at(-1)).toMatchObject({ failure: { kind: "timeout" } });
    const resumed = await createAgent({ session: saved!, model: fx.model, tools: fx.tools(), beforeFinish: requireVerification }).run("continue", { continuation: true });
    expect(resumed.status).toBe("complete"); expect(resumed.session.events.filter((e) => e.type === "tool_start" && e.call.name === "create")).toHaveLength(1);
    expect(await readFile(path.join(fx.cwd, "created.js"), "utf8")).toBe('export const a = 1;\n');
  } finally { await fx.close(); }
}, 10000);
