import React from "react";
import { z } from "zod";
import { createShellTool } from "../../src/tools/shell.js";
import { DEFAULT_RUNTIME_CONFIG } from "../../src/core/runtimeConfig.js";
import type { Session } from "../../src/session/types.js";
import { PassThrough } from "node:stream";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { render, type Instance } from "ink";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Input, type InputProps } from "../../src/ui/Input.js";
import { App } from "../../src/ui/App.js";
import { createAgent } from "../../src/api.js";
import { buildSlashCommands } from "../../src/ui/utils/slashCommands.js";
import { loadFileSuggestions } from "../../src/ui/fileSuggestions.js";
import { askUserQuestion, todo } from "../../src/tools/interaction.js";

const mounted: Instance[] = [];
afterEach(() => { for (const instance of mounted.splice(0)) { instance.unmount(); instance.cleanup(); } });
function mount(element: React.ReactNode) {
  const stdin = Object.assign(new PassThrough(), { isTTY: true, setRawMode() {}, ref() {}, unref() {} });
  const stdout = Object.assign(new PassThrough(), { isTTY: true, columns: 100, rows: 50 });
  const frames: string[] = [];
  stdout.on("data", (chunk) => {
    const frame = String(chunk).replace(/\u001b\[[0-9;?]*[a-zA-Z]/g, "");
    if (frame.trim()) frames.push(frame); // Cursor visibility packets are not rendered frames.
  });
  const instance = render(element, { stdin: stdin as unknown as NodeJS.ReadStream, stdout: stdout as unknown as NodeJS.WriteStream,
    stderr: stdout as unknown as NodeJS.WriteStream, debug: true, patchConsole: false, exitOnCtrlC: false });
  mounted.push(instance);
  return { instance, frame: () => frames.at(-1) ?? "", async key(text: string) { stdin.write(text); await new Promise((resolve) => setTimeout(resolve, 25)); } };
}
const skills = buildSlashCommands(Array.from({ length: 8 }, (_, i) => ({ name: `skill-${i}`, description: `Description ${i}`, sourcePath: `/skill-${i}/SKILL.md`, sourceScope: "workspace" as const, command: `/skill-${i}` })));

async function inputUi(props: Partial<InputProps> = {}) {
  const submit = vi.fn(); const exit = vi.fn();
  const ui = mount(<Input enabled onSubmit={submit} onExit={exit} loadCommands={async () => skills} {...props} />);
  await new Promise((resolve) => setTimeout(resolve, 20));
  return { ...ui, submit, exit };
}

describe("restored keyboard interactions through Ink", () => {
  it("opens @ suggestions on paste, filters, inserts a path and submits only on the next Enter", async () => {
    const ui = await inputUi({ loadFiles: async () => ["src/a.ts", "src/my file.ts", "tests/check.ts"] });
    await ui.key("查看 @src/");
    await vi.waitFor(() => expect(ui.frame()).toContain("src/a.ts"));
    expect(ui.frame()).not.toContain("tests/check.ts");
    await ui.key("\u001b[B"); await ui.key("\r");
    expect(ui.submit).not.toHaveBeenCalled();
    expect(ui.frame()).toContain('查看 "src/my file.ts"');
    await ui.key("\r");
    expect(ui.submit).toHaveBeenCalledWith('查看 "src/my file.ts"');
  });
  it("scrolls every skill into view and converts the selected invocation", async () => {
    const ui = await inputUi(); await ui.key("/skill");
    await vi.waitFor(() => expect(ui.frame()).toContain("Description 0"));
    for (let i = 0; i < 7; i++) await ui.key("\u001b[B");
    expect(ui.frame()).toContain("> /skill-7");
    expect(ui.frame()).toContain("8/8");
    await ui.key("\r"); expect(ui.submit).not.toHaveBeenCalled();
    await ui.key("review src"); await ui.key("\r");
    expect(ui.submit).toHaveBeenCalledWith("$skill-7 review src");
  });
  it("dismisses picker on Ctrl+C before asking the app to exit", async () => {
    const ui = await inputUi(); await ui.key("/");
    await vi.waitFor(() => expect(ui.frame()).toContain("/clear"));
    await ui.key("\u0003"); expect(ui.exit).not.toHaveBeenCalled();
    await ui.key("\u0003"); expect(ui.exit).toHaveBeenCalledTimes(1);
  });
  it("ignores stale asynchronous file results after closing and reopening", async () => {
    let first!: (files: string[]) => void; let count = 0;
    const ui = await inputUi({ loadFiles: async () => ++count === 1 ? new Promise((resolve) => { first = resolve; }) : ["fresh.ts"] });
    await ui.key("@"); await ui.key("\u001b"); await ui.key("\u007f"); await ui.key("@");
    await vi.waitFor(() => expect(ui.frame()).toContain("fresh.ts"));
    first(["stale.ts"]); await new Promise((resolve) => setTimeout(resolve, 30));
    expect(ui.frame()).not.toContain("stale.ts");
  });
  it("does not run a task when an empty picker receives Enter", async () => {
    const ui = await inputUi({ loadFiles: async () => [] });
    await ui.key("@"); await ui.key("\r");
    expect(ui.submit).not.toHaveBeenCalled();
    expect(ui.frame()).toContain("没有匹配项");
    await ui.key("\u001b");
    expect(ui.frame()).not.toContain("没有匹配项");
  });
  it("keeps the welcome logo intact beside a long working directory", async () => {
    const ui = mount(<App makeAgent={() => createAgent({ cwd: `/very/long/${"workspace/".repeat(12)}`, model: { async generate() { return { text: "unused" }; } } })} modelName="test" version="test" />);
    await vi.waitFor(() => expect(ui.frame()).toContain("███╗   ██╗ █████╗ ███╗   ██╗ ██████╗"));
  });
  it("retains storage failures after completion and clears them with a new session", async () => {
    const ui = mount(<App task="task" modelName="fixture" version="fixture" makeAgent={() => createAgent({
      model: { async generate() { return { text: "done" }; } },
      save: async () => { throw new Error("disk full"); }
    })} />);
    await vi.waitFor(() => {
      expect(ui.frame()).toContain("⏺ done");
      expect(ui.frame()).toContain("Enter 执行");
      expect(ui.frame()).toContain("会话保存失败：disk full");
    });
    await ui.key("/clear "); await ui.key("\r");
    await vi.waitFor(() => expect(ui.frame()).not.toContain("disk full"));
    expect(ui.frame()).not.toContain("⏺ done");
  });
  it("keeps the previous double-Ctrl+C exit behavior", async () => {
    const ui = mount(<App makeAgent={() => createAgent({ model: { async generate() { return { text: "unused" }; } } })} modelName="test" version="test" />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await ui.key("\u0003");
    expect(ui.frame()).toContain("再按一次 Ctrl+C");
    const exited = ui.instance.waitUntilExit();
    await ui.key("\u0003");
    await exited;
  });
  it("derives the original task progress panel from tool events", async () => {
    let round = 0;
    const ui = mount(<App task="规划任务" makeAgent={(ask) => createAgent({ ask, tools: [todo, askUserQuestion], model: { async generate() {
      round++;
      if (round === 1) return { text: "", toolCalls: [{ name: "todo", input: { items: [{ text: "读取", status: "completed" }, { text: "修改", status: "in_progress" }] } }] };
      if (round === 2) return { text: "", toolCalls: [{ name: "ask_user_question", input: { title: "继续检查？", options: [{ value: "yes", label: "继续", shortcutKey: "y" }] } }] };
      return { text: "完成" };
    } } })} modelName="test" version="test" />);
    await vi.waitFor(() => expect(ui.frame()).toContain("继续检查？"));
    expect(ui.frame()).toContain("已完成 1/2");
    expect(ui.frame()).toContain("修改 (进行中)");
    expect(ui.frame()).toContain("等待用户选择");
    await ui.key("y"); await vi.waitFor(() => expect(ui.frame()).toContain("⏺ 完成"));
  });
  it("selects a permission answer and can cancel the next question without hanging", async () => {
    let round = 0;
    const agents: ReturnType<typeof createAgent>[] = [];
    const ui = mount(<App makeAgent={(ask) => {
      const agent = createAgent({ ask, tools: [askUserQuestion], model: { async generate() {
        if (++round % 2) return { text: "", toolCalls: [{ name: "ask_user_question", input: { title: "需要选择", options: [{ label: "允许", value: "yes", shortcutKey: "y" }, { label: "拒绝", value: "no", shortcutKey: "n" }] } }] };
        return { text: "已回答" };
      } } }); agents.push(agent); return agent;
    }} modelName="test" version="test" />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await ui.key("task"); await ui.key("\r");
    await vi.waitFor(() => expect(ui.frame()).toContain("需要选择"));
    await ui.key("y"); await vi.waitFor(() => expect(ui.frame()).toContain("已回答"));
    await ui.key("again"); await ui.key("\r");
    await vi.waitFor(() => expect(ui.frame()).toContain("需要选择"));
    await ui.key("\u001b");
    await vi.waitFor(() => expect(agents[0].session.events.at(-1)).toMatchObject({ type: "finish", status: "cancelled" }));
  });
});

describe("execution timeline and live feedback through Ink", () => {
  it("shows real model waiting with elapsed time and cancellation", async () => {
    const agent = createAgent({ model: { async generate(_messages, options) {
      return new Promise((resolve) => options?.abortSignal?.addEventListener("abort", () => resolve({ text: "unused" }), { once: true }));
    } } });
    const ui = mount(<App task="wait" makeAgent={() => agent} modelName="fixture" version="fixture" />);
    await vi.waitFor(() => expect(ui.frame()).toContain("等待模型响应 · 第 1 轮"));
    await vi.waitFor(() => expect(Number(ui.frame().match(/已等待 ([\d.]+)s/)?.[1])).toBeGreaterThan(0));
    expect(ui.frame()).not.toContain("思考中");
    await ui.key("\u001b");
    await vi.waitFor(() => expect(agent.session.events.at(-1)).toMatchObject({ type: "finish", status: "cancelled" }));
    expect(ui.frame()).not.toContain("等待模型响应");
  });
  it.each(["complete", "error", "cancelled"])("auto-collapses details opened during a run on %s, retaining history", async (ending) => {
    let round = 0; let finish!: () => void;
    const agent = createAgent({ tools: [{ name: "echo", description: "fixture", schema: z.object({}), async execute() { return { ok: true, output: "SAVED_RESULT" }; } }],
      model: { async generate(_messages, options) {
        if (++round === 1) return { text: "", toolCalls: [{ name: "echo", input: {} }] };
        await new Promise<void>((resolve, reject) => {
          finish = ending === "error" ? () => reject(new Error("fixture failure")) : resolve;
          options?.abortSignal?.addEventListener("abort", () => resolve(), { once: true });
        });
        return { text: "done" };
      } }
    });
    const ui = mount(<App task="task" makeAgent={() => agent} modelName="fixture" version="fixture" />);
    await vi.waitFor(() => expect(ui.frame()).toContain("等待模型响应 · 第 2 轮"));
    expect(ui.frame()).toContain("执行记录 · 1 项");
    await ui.key("\u000f"); expect(ui.frame()).toContain("操作详情");
    if (ending === "cancelled") await ui.key("\u001b"); else finish();
    await vi.waitFor(() => {
      expect(agent.session.events.at(-1)).toMatchObject({ type: "finish", status: ending });
      expect(ui.frame()).not.toContain("执行记录 ·");
      expect(ui.frame()).not.toContain("操作详情");
    });
    await ui.key("\u000f"); expect(ui.frame()).toContain("SAVED_RESULT");
    await ui.key("\u000f"); expect(ui.frame()).not.toContain("执行记录 ·");
  });
  it("keeps old interrupted work separate from the resumed model request", async () => {
    let finish!: () => void;
    const saved: Session = { version: 1, id: "fixture", cwd: process.cwd(), createdAt: 1, events: [
      { at: 1, type: "user", text: "old task", continuation: false },
      { at: 2, type: "tool_start", callId: "old", call: { name: "create", input: { path: "old.ts" } }, mutates: true }
    ] };
    const agent = createAgent({ session: saved, model: { async generate() { await new Promise<void>((resolve) => { finish = resolve; }); return { text: "done" }; } } });
    const ui = mount(<App resume makeAgent={() => agent} modelName="fixture" version="fixture" />);
    await vi.waitFor(() => expect(ui.frame()).toContain("等待模型响应"));
    expect(ui.frame()).toContain("上次中断 · 待核对");
    expect(ui.frame()).not.toContain("执行 创建文件");
    finish(); await vi.waitFor(() => expect(ui.frame()).toContain("⏺ done"));
  });
  it("collapses completed records and reopens older details without changing an input draft", async () => {
    let round = 0;
    const agent = createAgent({ model: { async generate() { return ++round === 1 ? { text: "", toolCalls: Array.from({ length: 12 }, (_, i) => ({ name: "echo", input: { text: `ROW_${i}` } })) } : { text: "done" }; } },
      tools: [{ name: "echo", description: "fixture", schema: z.object({ text: z.string() }), async execute(input) { return { ok: true, output: input.text }; } }]
    });
    const ui = mount(<App task="many" makeAgent={() => agent} modelName="fixture" version="fixture" />);
    await vi.waitFor(() => expect(ui.frame()).toContain("⏺ done"));
    expect(ui.frame()).not.toContain("执行记录 ·");
    await ui.key("draft"); await ui.key("\u000f");
    expect(ui.frame()).toContain("执行记录 · 12 项");
    expect(ui.frame()).toMatch(/\d+\.\ds/);
    expect(ui.frame()).toContain("操作详情 12/12");
    expect(ui.frame()).toContain("ROW_11");
    for (let i = 0; i < 11; i++) await ui.key("\u001b[A");
    expect(ui.frame()).toContain("操作详情 1/12");
    expect(ui.frame()).toContain("ROW_0");
    await ui.key("\r"); expect(agent.session.events.filter((event) => event.type === "user")).toHaveLength(1);
    await ui.key("\u000f"); await ui.key("\r");
    await vi.waitFor(() => expect(agent.session.events.filter((event) => event.type === "user")).toHaveLength(2));
    expect(agent.session.events.filter((event) => event.type === "user").at(-1)).toMatchObject({ text: "draft" });
    await vi.waitFor(() => expect(ui.frame()).not.toContain("执行记录 ·"));
    await ui.key("\u000f"); expect(ui.frame()).toContain("执行记录 · 12 项");
  });
  it("shows meaningful stderr and pages through saved output after completion", async () => {
    let round = 0;
    const agent = createAgent({ model: { async generate() { return ++round === 1 ? { text: "", toolCalls: [{ name: "check", input: {} }] } : { text: "not complete" }; } },
      tools: [{ name: "check", description: "fixture", schema: z.object({}), async execute() { return { ok: false, output: "exit=7", effects: { command: { command: "test", exitCode: 7, stdout: "output", stderr: "REAL_ERROR\n" + Array.from({ length: 28 }, (_, i) => `DETAIL_${i}`).join("\n"), durationMs: 1400, verification: true } } }; } }]
    });
    const ui = mount(<App task="error" makeAgent={() => agent} modelName="fixture" version="fixture" />);
    await vi.waitFor(() => expect(ui.frame()).toContain("⏺ not complete"));
    expect(ui.frame()).not.toContain("执行记录 ·");
    await ui.key("\u000f");
    expect(ui.frame()).toContain("REAL_ERROR"); expect(ui.frame()).toContain("exit=7"); expect(ui.frame()).toContain("1.4s");
    await ui.key("\u001b[C");
    expect(ui.frame()).toContain("页 2/"); expect(ui.frame()).toContain("DETAIL_");
    for (let i = 0; i < 8; i++) await ui.key("\u001b[C");
    await ui.key("\u001b[D"); expect(ui.frame()).toContain("页 2/3");
  });
  it("keeps question keys ahead of detail navigation and does not treat Ctrl+O as an approval", async () => {
    let activeAgent!: ReturnType<typeof createAgent>;
    const ui = mount(<App task="ask" makeAgent={(ask) => {
      activeAgent = createAgent({ tools: [askUserQuestion], ask, model: { async generate() { return { text: "", toolCalls: [{ name: "ask_user_question", input: { title: "APPROVAL", options: [{ label: "allow", value: "allow", shortcutKey: "o" }] } }] }; } } });
      return activeAgent;
    }} modelName="fixture" version="fixture" />);
    await vi.waitFor(() => expect(ui.frame()).toContain("APPROVAL"));
    await ui.key("\u000f");
    expect(ui.frame()).not.toContain("操作详情");
    expect(activeAgent.session.events.some((event) => event.type === "tool_end")).toBe(false);
    await ui.key("\u001b");
    await vi.waitFor(() => expect(activeAgent.session.events.at(-1)).toMatchObject({ type: "finish", status: "cancelled" }));
  });
  it("renders actual command output before completion and retains the final output in details", async () => {
    let round = 0;
    const cwd = await mkdtemp(path.join(os.tmpdir(), "nanocodin-live-ui-"));
    const agent = createAgent({ cwd, tools: [createShellTool({ ...DEFAULT_RUNTIME_CONFIG.sandbox, defaultPolicy: "allow" })],
      model: { async generate() { return ++round === 1 ? { text: "", toolCalls: [{ name: "bash", input: { command: `node -e 'const fs=require("fs");console.log("LIVE_FROM_PROCESS");const t=setInterval(()=>{if(fs.existsSync("release")){clearInterval(t);console.log("FINAL_FROM_PROCESS")}},20);setTimeout(()=>process.exit(4),4000).unref()'` } }] } : { text: "done" }; } }
    });
    const ui = mount(<App task="live" makeAgent={() => agent} modelName="fixture" version="fixture" />);
    await vi.waitFor(() => expect(ui.frame()).toContain("│ LIVE_FROM_PROCESS"), { timeout: 3000 });
    expect(agent.session.events.some((event) => event.type === "finish")).toBe(false);
    await writeFile(path.join(cwd, "release"), "go");
    await vi.waitFor(() => expect(ui.frame()).toContain("⏺ done"), { timeout: 4000 });
    expect(ui.frame()).not.toContain("执行记录 ·");
    await ui.key("\u000f");
    expect(ui.frame()).toContain("exit=0");
    const savedOutput = /│\s+FINAL_FROM_PROCESS\s+│/;
    for (let i = 0; i < 3 && !savedOutput.test(ui.frame()); i++) await ui.key("\u001b[C");
    expect(ui.frame()).toMatch(savedOutput);
  }, 7000);
});

describe("workspace-scoped file suggestions", () => {
  it("refreshes a non-Git workspace and ignores generated paths", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "nanocodin-picker-"));
    await mkdir(path.join(cwd, "node_modules")); await mkdir(path.join(cwd, "src"));
    await writeFile(path.join(cwd, "node_modules", "hidden.ts"), ""); await writeFile(path.join(cwd, "src", "one.ts"), "");
    expect(await loadFileSuggestions(cwd)).toEqual(["src/one.ts"]);
    await writeFile(path.join(cwd, "src", "two.ts"), "");
    expect(await loadFileSuggestions(cwd)).toEqual(["src/one.ts", "src/two.ts"]);
    const abort = new AbortController(); abort.abort();
    await expect(loadFileSuggestions(cwd, abort.signal)).rejects.toBeDefined();
  });
});
