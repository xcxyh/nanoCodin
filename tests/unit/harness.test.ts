import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createAgent, defineTool, projectSession, requireVerification, ToolRegistry, type AgentEvent, type Model, type ModelResponse, type Tool } from "../../src/api.js";
import { buildMessages } from "../../src/agent/context.js";
import { parseTextAction } from "../../src/agent/protocol.js";

const call = (name: string, input: unknown = {}): ModelResponse => ({ text: "", toolCalls: [{ name, input }] });
const done = (answer = "完成", incomplete = false) => call("final", { answer, incomplete });
function script(responses: ModelResponse[]) {
  const prompts: string[] = [];
  const model: Model = { async generate(messages) { prompts.push(messages.map((message) => message.content).join("\n")); return responses.shift() ?? done(); } };
  return { model, prompts };
}
const echo = defineTool({ name: "echo", description: "Echo", schema: z.object({ text: z.string() }), async execute({ text }) { return { ok: true, output: text }; } });
const edit: Tool = { name: "custom_write", description: "write", schema: z.object({}), mutates: true, async execute() { return { ok: true, output: "edited", effects: { changedFiles: ["a.ts"] } }; } };
const check: Tool = { name: "check", description: "check", schema: z.object({ code: z.number().optional() }), async execute({ code = 0 }) { return { ok: code === 0, output: "0 errors", effects: { command: { command: "custom-check", exitCode: code, stdout: "0 errors", stderr: "", durationMs: 1, verification: true } } }; } };

describe("minimal customizable Harness", () => {
  it("runs without built-in tools, config, persistence or UI", async () => {
    const agent = createAgent({ ...script([{ text: "普通回答" }]) });
    const result = await agent.run("你好");
    expect(result).toMatchObject({ status: "complete", answer: "普通回答" });
    expect(agent.session.events.map((event) => event.type)).toEqual(["user", "finish"]);
  });
  it("executes a typed custom tool and gives its actual result to an injected model", async () => {
    const { model, prompts } = script([call("echo", { text: 'unique: "<content>"' }), done()]);
    const result = await createAgent({ model, tools: [echo] }).run("调用工具");
    expect(result.status).toBe("complete");
    expect(prompts[1].match(/unique:/g)).toHaveLength(2); // input and output; no second trajectory copy
    expect(prompts[1]).toContain('OK: unique: "<content>"');
    expect(prompts[1]).not.toContain("&quot;");
  });
  it("processes all calls sequentially and does not lose results", async () => {
    const { model } = script([{ text: "", toolCalls: [{ name: "echo", input: { text: "one" } }, { name: "echo", input: { text: "two" } }] }, done()]);
    const result = await createAgent({ model, tools: [echo] }).run("执行两个调用");
    expect(result.session.events.filter((event) => event.type === "tool_end").map((event) => event.result.output)).toEqual(["one", "two"]);
  });
  it("rejects mixed final batches before any call is executed", async () => {
    const execute = vi.fn(echo.execute);
    const { model } = script([{ text: "", toolCalls: [{ name: "echo", input: { text: "one" } }, { name: "final", input: { answer: "done" } }] }, done()]);
    const result = await createAgent({ model, tools: [{ ...echo, execute }] }).run("执行");
    expect(execute).not.toHaveBeenCalled();
    expect(result.session.events.some((event) => event.type === "notice" && event.text.includes("mixed batch"))).toBe(true);
  });
  it("feeds unknown tools, schema errors and malformed text back for correction", async () => {
    const { model, prompts } = script([call("missing"), call("echo", { wrong: "x" }), { text: 'Action: echo\nAction Input: {bad}' }, call("echo", { text: "corrected" }), done()]);
    const result = await createAgent({ model, tools: [echo] }).run("执行");
    expect(result.status).toBe("complete");
    expect(prompts[1]).toContain("Available tools: echo");
    expect(prompts[2]).toContain("Invalid input for echo");
    expect(prompts[3]).toContain("Invalid Action Input JSON");
  });
  it("records tool exceptions and keeps working", async () => {
    const { model } = script([call("throw", { text: "x" }), done()]);
    const result = await createAgent({ model, tools: [{ ...echo, name: "throw", async execute() { throw new Error("ENOENT"); } }] }).run("执行");
    expect(result.status).toBe("complete");
    expect(result.session.events.some((event) => event.type === "tool_end" && event.result.output === "ENOENT")).toBe(true);
  });
  it("keeps verification outside the generic loop and supports a replacement finish hook", async () => {
    const generic = await createAgent({ ...script([call("custom_write"), done()]), tools: [edit] }).run("改动");
    expect(generic.status).toBe("complete");
    const coding = await createAgent({ ...script([call("custom_write"), done(), call("check"), done()]), tools: [edit, check], beforeFinish: requireVerification }).run("改动");
    expect(coding.status).toBe("complete");
    expect(coding.session.events.some((event) => event.type === "notice" && event.text.includes("Verification required"))).toBe(true);
    const custom = await createAgent({ ...script([done(), done("缺少授权", true)]), beforeFinish: () => "需要业务授权" }).run("任务");
    expect(custom.status).toBe("incomplete");
  });
  it("invalidates checks on another change and uses actual exit codes", async () => {
    const { model } = script([call("custom_write"), call("check"), call("custom_write"), done(), call("check", { code: 1 }), done("检查失败", true)]);
    const result = await createAgent({ model, tools: [edit, check], beforeFinish: requireVerification }).run("修改");
    expect(result.status).toBe("incomplete");
    expect(projectSession(result.session).verified).toBe(false);
  });
  it("checks every declared verification command", async () => {
    const plan: Tool = { name: "plan", description: "plan", schema: z.object({}), async execute() { return { ok: true, output: "planned", effects: { plan: [{ text: "检查", status: "pending" }], verificationCommands: ["custom-check", "another-check"] } }; } };
    const result = await createAgent({ ...script([call("plan"), call("custom_write"), call("check"), done("仍需 another-check", true)]), tools: [plan, edit, check], beforeFinish: requireVerification }).run("改动");
    expect(projectSession(result.session).missingChecks).toEqual(["another-check"]);
  });
  it("has only one model-round budget; repeated tool errors do not create hidden stop limits", async () => {
    const generate = vi.fn().mockResolvedValue(call("missing"));
    const result = await createAgent({ model: { generate }, maxSteps: 4 }).run("任务");
    expect(generate).toHaveBeenCalledTimes(4);
    expect(result.status).toBe("incomplete");
    expect(result.answer).not.toContain("Execution summary");
  });
  it("records protocol errors, truncation and invalid final input without false completion", async () => {
    const result = await createAgent({ ...script([{ text: "", error: "invalid SDK tool" }, { text: "partial", finishReason: "length" }, call("final", { answer: "" }), done()]) }).run("任务");
    expect(result.status).toBe("complete");
    expect(result.session.events.filter((event) => event.type === "notice")).toHaveLength(3);
  });
  it("preserves turns, supports reset, and isolates returned snapshots and event observers", async () => {
    const { model, prompts } = script([done("first answer"), done(), done()]);
    const agent = createAgent({ model });
    await agent.run("first task", { onEvent(event) { if (event.type === "user") event.text = "tampered"; } });
    const copy = agent.session; copy.events.length = 0;
    await agent.run("follow-up");
    expect(prompts[1]).toContain("first answer");
    expect(prompts[1]).toContain("first task");
    agent.reset(); await agent.run("new task");
    expect(prompts[2]).not.toContain("first task");
  });
  it("saves complete and failed runs, tolerating storage errors without hiding them", async () => {
    const save = vi.fn().mockRejectedValue(new Error("disk full"));
    const observed: AgentEvent[] = [];
    const result = await createAgent({ ...script([done()]), save }).run("任务", { onEvent: (event) => observed.push(event) });
    expect(result.status).toBe("complete");
    expect(result.persistenceError).toBe("disk full");
    expect(observed.filter((event) => event.type === "notice")).toHaveLength(1);
    const failed = await createAgent({ model: { async generate() { throw new Error("API unavailable"); } } }).run("任务");
    expect(failed).toMatchObject({ status: "error", answer: "API unavailable" });
  });
  it("cancels after a completed write without executing the rest of a batch", async () => {
    const abort = new AbortController();
    const tool: Tool = { ...edit, async execute() { abort.abort(); return { ok: true, output: "done", effects: { changedFiles: ["partial.ts"] } }; } };
    const result = await createAgent({ ...script([{ text: "", toolCalls: [{ name: "custom_write", input: {} }, { name: "echo", input: { text: "later" } }] }]), tools: [tool, echo] }).run("任务", { signal: abort.signal });
    expect(result.status).toBe("cancelled");
    expect(result.session.events.filter((event) => event.type === "tool_end")).toHaveLength(1);
    expect(projectSession(result.session).files).toEqual(["partial.ts"]);
  });
  it("records uncertain changes when a mutating tool is interrupted", async () => {
    const abort = new AbortController();
    const result = await createAgent({ ...script([call("custom_write")]), tools: [{ ...edit, async execute() { abort.abort(); abort.signal.throwIfAborted(); throw new Error("unreachable"); } }] }).run("任务", { signal: abort.signal });
    expect(result.status).toBe("cancelled");
    expect(projectSession(result.session).changed).toBe(true);
  });
  it("restores a supplied session and warns about calls interrupted before a result was saved", async () => {
    const original = createAgent({ ...script([done()]) });
    await original.run("original task");
    const session = original.session;
    session.events.push({ type: "tool_start", at: Date.now(), callId: "interrupted", call: { name: "write", input: { path: "a.ts" } } });
    const { model, prompts } = script([done()]);
    await createAgent({ model, session }).run("continue", { continuation: true });
    expect(prompts[0]).toContain("original task");
    expect(prompts[0]).toContain("do not automatically replay writes");
  });
  it("bounds prompt history without changing the stored history or losing the original request", async () => {
    const agent = createAgent({ ...script(Array.from({ length: 12 }, () => call("echo", { text: "x".repeat(300) })).concat(done())), tools: [echo] });
    const result = await agent.run("original request");
    const messages = buildMessages(result.session, "instructions", 1000);
    expect(messages.at(-1)!.content.length).toBeLessThan(1300);
    expect(messages.some((message) => message.content === "original request")).toBe(true);
    expect(result.session.events.filter((event) => event.type === "tool_end")).toHaveLength(12);
  });
  it("replaces default instructions and builds them once per run", async () => {
    const instructions = vi.fn(async () => "CUSTOM_INSTRUCTIONS_ONLY");
    const prompts: string[] = [];
    let first = true;
    const model: Model = { async generate(messages) {
      prompts.push(messages[0].content);
      if (first) { first = false; return call("echo", { text: "x" }); }
      return done();
    } };
    await createAgent({ model, tools: [echo], instructions }).run("任务");
    expect(instructions).toHaveBeenCalledTimes(1);
    expect(prompts).toEqual(["CUSTOM_INSTRUCTIONS_ONLY", "CUSTOM_INSTRUCTIONS_ONLY"]);
  });
  it("cancels while waiting for an injected model", async () => {
    const abort = new AbortController();
    const model: Model = { async generate(_messages, options) {
      return new Promise((_resolve, reject) => options?.abortSignal?.addEventListener("abort", () => reject(new Error("cancelled")), { once: true }));
    } };
    const run = createAgent({ model }).run("任务", { signal: abort.signal });
    setTimeout(() => abort.abort(), 10);
    expect((await run).status).toBe("cancelled");
  });
  it("rejects concurrent runs and resets while active", async () => {
    let finish!: (result: ModelResponse) => void;
    const agent = createAgent({ model: { generate: () => new Promise((resolve) => { finish = resolve; }) } });
    const run = agent.run("one");
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expect(agent.run("two")).rejects.toThrow("already active");
    expect(() => agent.reset()).toThrow("running");
    finish(done()); await run;
    expect(() => createAgent({ ...script([]), maxSteps: 0 })).toThrow("maxSteps");
    expect(() => createAgent({ ...script([]), maxHistoryChars: NaN })).toThrow("maxHistoryChars");
    expect(() => createAgent({ ...script([]), cwd: "/different", session: agent.session })).toThrow("cwd");
    await expect(agent.run(" ")).rejects.toThrow("empty");
  });
});

describe("tool protocol and registry", () => {
  it("parses multiline and inline input and rejects damaged actions", () => {
    expect(parseTextAction('Action: echo\nAction Input: {\n"text":"quoted <text>"\n}')).toEqual({ name: "echo", input: { text: "quoted <text>" } });
    expect(parseTextAction('Action: echo {"text":"x"}').input).toEqual({ text: "x" });
    for (const text of ["Thought: not done", "Action: echo\nAction Input: []", "Action: echo\nAction Input: broken"]) expect(() => parseTextAction(text)).toThrow();
  });
  it("rejects duplicate and reserved tools instead of silently overwriting them", () => {
    expect(() => new ToolRegistry([echo, echo])).toThrow("Duplicate");
    expect(() => new ToolRegistry([{ ...echo, name: "final" }])).toThrow("reserved");
    expect(() => new ToolRegistry([{ ...echo, name: "bad name" }])).toThrow("Invalid");
  });
});
