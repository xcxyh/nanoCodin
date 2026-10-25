import { afterEach, describe, expect, it, vi } from "vitest";
import { runModelRequest } from "../../src/model/request.js";
import { createModelProvider } from "../../src/model/provider.js";
import type { ResolvedModelConfig } from "../../src/core/runtimeConfig.js";
import { ModelRequestError } from "../../src/api.js";
const config: ResolvedModelConfig = { provider: "openai", name: "fixture", apiKey: "fixture", baseUrl: "https://fixture.invalid/v1", requestTimeoutMs: 500, idleTimeoutMs: 80, maxRetries: 0 };
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const consume = async (transport: { signal: AbortSignal; fetch: typeof fetch }) => { const response = await transport.fetch("https://fixture.invalid", { signal: transport.signal }); return { text: await response.text() }; };
function alive(interval = 30, completeAt?: number) {
  return vi.fn(async () => { let timer: ReturnType<typeof setInterval>; return new Response(new ReadableStream({ start(controller) {
    timer = setInterval(() => controller.enqueue(new TextEncoder().encode(" ")), interval);
    if (completeAt !== undefined) setTimeout(() => { clearInterval(timer); controller.enqueue(new TextEncoder().encode("done")); controller.close(); }, completeAt);
  }, cancel() { clearInterval(timer); } }), { headers: { "x-request-id": "fixture-id" } }); });
}
describe("one observable model request budget", () => {
  it("allows a slow response with keep-alives beyond the idle budget", async () => {
    vi.useFakeTimers(); vi.stubGlobal("fetch", alive(30, 240));
    const running = runModelRequest(config, undefined, consume);
    await vi.advanceTimersByTimeAsync(260);
    const result = await running;
    expect(result.text.trim()).toBe("done"); expect(result.request).toMatchObject({ attempts: 1, requestId: "fixture-id" });
    expect(result.request!.receivedBytes).toBeGreaterThan(4);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("stops at the total budget even if data keeps arriving", async () => {
    vi.useFakeTimers(); let timer: ReturnType<typeof setInterval>;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({ start(c) { timer = setInterval(() => c.enqueue(new Uint8Array([32])), 20); }, cancel() { clearInterval(timer); } }))));
    const running = runModelRequest(config, undefined, consume).catch((error) => error);
    await vi.advanceTimersByTimeAsync(510);
    const error = await running;
    expect(error).toBeInstanceOf(ModelRequestError); expect(error.failure).toMatchObject({ kind: "timeout", timeoutScope: "total", attempts: 1 });
    expect(error.failure.receivedBytes).toBeGreaterThan(0); expect(vi.getTimerCount()).toBe(0);
  });
  it("times out an unresponsive fetch and distinguishes caller cancellation", async () => {
    vi.useFakeTimers(); vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const idle = runModelRequest(config, undefined, consume).catch((error) => error);
    await vi.advanceTimersByTimeAsync(90); expect((await idle).failure).toMatchObject({ kind: "timeout", timeoutScope: "idle" });
    const abort = new AbortController(); const cancelled = runModelRequest(config, abort.signal, consume).catch((error) => error);
    abort.abort(); await vi.advanceTimersByTimeAsync(0);
    expect((await cancelled).failure.kind).toBe("cancelled"); expect(vi.getTimerCount()).toBe(0);
  });
  it("retries a rate limit once, honors Retry-After, and does not retry auth", async () => {
    vi.useFakeTimers(); const fetch = vi.fn().mockResolvedValueOnce(new Response("limited", { status: 429, headers: { "retry-after": "1" } })).mockResolvedValue(new Response("done"));
    vi.stubGlobal("fetch", fetch);
    const generate = async (transport: Parameters<typeof consume>[0]) => { const r = await transport.fetch("https://fixture.invalid"); if (!r.ok) { await r.text(); throw Object.assign(new Error("rate limit"), { statusCode: r.status }); } return { text: await r.text() }; };
    const running = runModelRequest({ ...config, requestTimeoutMs: 3000, maxRetries: 1 }, undefined, generate);
    await vi.advanceTimersByTimeAsync(999); expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2); expect((await running).request?.attempts).toBe(2);
    fetch.mockReset().mockResolvedValue(new Response("denied", { status: 401 }));
    const error = await runModelRequest(config, undefined, generate).catch((e) => e);
    expect(error.failure.kind).toBe("auth"); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("uses the actual SDK, preserves native roles and does not turn auth into text fallback", async () => {
    const fetch = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      expect(body.messages.map((m: any) => m.role)).toEqual(["user", "assistant", "user"]);
      return new Response(JSON.stringify({ error: { message: "tools unsupported but credentials denied" } }), { status: 401, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetch);
    const provider = createModelProvider(config);
    const error = await provider.generate([{ role: "user", content: "one" }, { role: "assistant", content: "answer" }, { role: "user", content: "two" }], { tools: [] }).catch((e) => e);
    expect(error.failure.kind).toBe("auth"); expect(fetch).toHaveBeenCalledTimes(1);
  });
});

it("keeps provider-required continuation private and replays it for native DeepSeek calls", async () => {
  const { createAgent } = await import("../../src/api.js");
  const { z } = await import("zod");
  let round = 0; const bodies: any[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
    const body = JSON.parse(init.body); bodies.push(body); round++;
    if (round > 1) for (const message of body.messages) if (message.role === "assistant") expect(message.reasoning_content).toBe("PROTOCOL_ONLY");
    const name = round === 1 ? "echo" : "final";
    return new Response(JSON.stringify({ id: "fixture", object: "chat.completion", created: 1, model: "fixture", choices: [{ index: 0, finish_reason: "tool_calls", message: { role: "assistant", content: null, reasoning_content: "PROTOCOL_ONLY", tool_calls: [{ id: `call_${round}`, type: "function", function: { name, arguments: JSON.stringify(round === 1 ? {} : { answer: "done" }) } }] } }], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } }), { headers: { "content-type": "application/json" } });
  }));
  const provider = createModelProvider({ ...config, baseUrl: "https://api.deepseek.com", requestTimeoutMs: 2000 });
  const result = await createAgent({ model: provider, tools: [{ name: "echo", description: "fixture", schema: z.object({}), async execute() { return { ok: true, output: "echo" }; } }] }).run("task");
  expect(result.status).toBe("complete"); expect(bodies).toHaveLength(2);
  const { buildMessages } = await import("../../src/agent/context.js");
  expect(JSON.stringify(buildMessages(result.session, "rules"))).not.toContain("PROTOCOL_ONLY");
  expect(result.session.events.some((event) => event.type === "model_end" && event.providerData)).toBe(true);
});

it("learns a proxy's continuation requirement once without losing data or replaying tools", async () => {
  const { createAgent } = await import("../../src/api.js"); const { z } = await import("zod");
  let round = 0; let executions = 0;
  const fetch = vi.fn(async (_url, init) => {
    const body = JSON.parse(init.body); round++;
    if (round === 2) return new Response(JSON.stringify({ error: { message: "reasoning_content must be passed back" } }), { status: 400, headers: { "content-type": "application/json" } });
    if (round === 3) expect(body.messages.find((m: any) => m.role === "assistant").reasoning_content).toBe("PRIVATE_STATE");
    return new Response(JSON.stringify({ id: "fixture", object: "chat.completion", created: 1, model: "fixture", choices: [{ index: 0, finish_reason: "tool_calls", message: { role: "assistant", content: null, reasoning_content: "PRIVATE_STATE", tool_calls: [{ id: `call_${round}`, type: "function", function: { name: round === 1 ? "echo" : "final", arguments: JSON.stringify(round === 1 ? {} : { answer: "done" }) } }] } }], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } }), { headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetch);
  const result = await createAgent({ model: createModelProvider({ ...config, requestTimeoutMs: 2000 }), tools: [{ name: "echo", description: "fixture", schema: z.object({}), async execute() { executions++; return { ok: true, output: "echo" }; } }] }).run("task");
  expect(result.status).toBe("complete"); expect(fetch).toHaveBeenCalledTimes(3); expect(executions).toBe(1);
  expect(result.session.events.filter((e) => e.type === "model_end").at(-1)).toMatchObject({ request: { attempts: 2 } });
});

it("downgrades legacy DeepSeek history lacking continuation to explicit facts", async () => {
  const { createAgent } = await import("../../src/api.js");
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
    const body = JSON.parse(init.body);
    expect(body.messages.some((m: any) => m.role === "tool")).toBe(false);
    expect(body.messages.some((m: any) => String(m.content).includes("do not replay"))).toBe(true);
    return new Response(JSON.stringify({ id: "fixture", object: "chat.completion", created: 1, model: "fixture", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "done", reasoning_content: "private" } }], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } }), { headers: { "content-type": "application/json" } });
  }));
  const result = await createAgent({ model: createModelProvider({ ...config, baseUrl: "https://api.deepseek.com", requestTimeoutMs: 2000 }),
    session: { version: 1, id: "fixture", cwd: process.cwd(), createdAt: 1, events: [
      { at: 1, type: "user", text: "original", continuation: false },
      { at: 2, type: "tool_end", callId: "old", call: { name: "create", input: { path: "a.ts", content: "code" } }, result: { ok: true, output: "Created a.ts" } }
    ] }
  }).run("continue", { continuation: true });
  expect(result.status).toBe("complete"); expect(result.session.events.filter((e) => e.type === "tool_start")).toHaveLength(0);
});

it("does not downgrade a tool schema validation failure to text protocol", async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ error: { message: "tools parameters schema does not support anyOf" } }), { status: 400, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetch);
  const failure = await createModelProvider(config).generate([{ role: "user", content: "task" }], { tools: [] }).catch((e) => e);
  expect(failure.failure.kind).toBe("protocol"); expect(fetch).toHaveBeenCalledTimes(1);
});

it("does not expose a malformed raw response as an error detail", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response('{"reasoning_content":"PRIVATE_RESPONSE_CONTENT",broken', { headers: { "content-type": "application/json" } })));
  const failure = await createModelProvider(config).generate([{ role: "user", content: "task" }], { tools: [] }).catch((e) => e);
  expect(failure.failure.kind).toBe("protocol"); expect(failure.message).not.toContain("PRIVATE_RESPONSE_CONTENT");
});
