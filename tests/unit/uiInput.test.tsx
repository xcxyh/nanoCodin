import React from "react";
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
    expect(ui.frame()).toContain("已完成 1/2 (50%)");
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
