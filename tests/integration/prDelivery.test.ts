import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createAgent, requireVerification, type ModelResponse, type Session, type ToolResult } from "../../src/api.js";
import { prSession as trace } from "../fixtures/prSession.js";
import { createShellTool } from "../../src/tools/shell.js";
import { DEFAULT_RUNTIME_CONFIG } from "../../src/config/types.js";

const commit = (subject: string) => `git commit -m "${subject}"`;
const create = `gh pr create --base main --head ${trace.branch} --title refactor --body-file pr.md`;
const local = "git rev-parse HEAD";
const view = `gh pr view ${trace.url} --json url,state,headRefOid,baseRefName,headRefName`;
const viewResult = { url: trace.url, state: "OPEN", headRefOid: trace.head, baseRefName: "main", headRefName: trace.branch };
const receipt = (command: string, stdout: string, uncertainChanges = true): ToolResult => ({
  ok: true, output: stdout, effects: { uncertainChanges, command: { command, stdout, stderr: "", durationMs: 1, exitCode: 0, verification: false } }
});
const shellCall = (command: string): ModelResponse => ({
  text: "", toolCall: { name: "bash", input: { command } }
});
const commands = [...trace.commits.map(commit), `git push -u origin ${trace.branch}`, create, local, view];
const results: Record<string, string> = { [create]: trace.url, [local]: trace.head, [view]: JSON.stringify(viewResult) };

function replay(steps: ModelResponse[], output = results, maxSteps = steps.length, session?: Session) {
  // Only replay recorded tool results. No git or GitHub mutations occur.
  const prompts: string[] = [];
  const agent = createAgent({ session, maxSteps, beforeFinish: requireVerification, tools: [{
    name: "bash", description: "recorded shell", schema: z.object({ command: z.string() }),
    async execute({ command }) { return receipt(command, output[command] ?? ""); }
  }], model: { async generate(messages) {
    prompts.push(messages.at(-1)!.content);
    return steps.shift()!;
  } } });
  return { agent, prompts };
}
const final = { text: `6 个提交，PR 已创建并核对 HEAD：${trace.url}` };

describe("PR delivery regression from session mwpoefey-0caaad0d", () => {
  it("finishes immediately after the open PR and full local HEAD match, without running another code test", async () => {
    const steps = [...commands.map(shellCall), final];
    const { agent, prompts } = replay(steps);
    const result = await agent.run(trace.task);
    expect(result.status).toBe("complete");
    expect(result.answer).toContain(trace.url);
    expect(prompts.at(-1)).toContain("已确认 PR 为 OPEN");
    expect(result.session.events.filter(e => e.type === "notice")).toHaveLength(0);
  });

  it.each([
    [{ ...viewResult, headRefOid: "1".repeat(40) }, "HEAD 不一致"],
    [{ ...viewResult, state: "CLOSED" }, "CLOSED"],
    [{ ...viewResult, url: trace.url + "9" }, "待核对"],
    [{ ...viewResult, baseRefName: "wrong" }, "分支"]
  ])("keeps a conflicting readback incomplete and preserves the delivered URL", async (pr, reason) => {
    const { agent } = replay([...commands.map(shellCall), final], { ...results, [view]: JSON.stringify(pr) });
    const result = await agent.run(trace.task);
    expect(result.status).toBe("incomplete");
    expect(result.answer).toContain("6 次 git commit");
    expect(result.answer).toContain(trace.url);
    expect(result.answer).toContain(reason);
  });

  it("reports the confirmed PR on a last-round readback even when there is no round left for final", async () => {
    const { agent } = replay(commands.map(shellCall));
    const result = await agent.run(trace.task);
    expect(result.status).toBe("incomplete");
    expect(result.answer).toContain(trace.head);
    expect(result.answer).toContain(trace.url);
    expect(result.answer).toContain("最终答复");
  });

  it("invalidates stale HEAD evidence after another commit; ordinary review of a PR has no creation gate", async () => {
    const { agent } = replay([...commands.map(shellCall), shellCall(commit("follow-up")), final]);
    const result = await agent.run(trace.task);
    expect(result.answer).toContain("待核对");
    expect(result.status).toBe("incomplete");
    const next = replay([{ text: "review" }], {}, 1, result.session);
    expect((await next.agent.run("解释这个 PR 的改动")).status).toBe("complete");
  });

  it("still requires an independent successful code check when the same task edited a file", async () => {
    const edit = { type: "tool_end" as const, at: 2, callId: "write", call: { name: "str_replace", input: {} },
      result: { ok: true, output: "updated", effects: { changedFiles: ["src/api.ts"] } } };
    const prior: Session = { version: 1, id: "mixed", createdAt: 1, cwd: process.cwd(),
      events: [{ type: "user", at: 1, continuation: false, text: trace.task }, edit] };
    const { agent } = replay([...commands.map(shellCall), final], results, commands.length + 1, prior);
    const result = await agent.run("继续", { continuation: true });
    expect(result.status).toBe("incomplete");
    expect(result.answer).toContain("src/api.ts");
    expect(result.answer).toContain("尚无成功的独立检查");
    expect(result.answer).toContain(trace.url);
  });

  it("does not count a standalone repo query as a code check through the actual Bash tool", async () => {
    const bash = createShellTool({ ...DEFAULT_RUNTIME_CONFIG.sandbox, defaultPolicy: "allow" });
    const result = await bash.execute({ command: local, purpose: "verify" }, { cwd: process.cwd() });
    expect(result).toMatchObject({ ok: true, effects: { uncertainChanges: false, command: { verification: false } } });
  });
});

it("resumes the recorded compound commands and rejected final without repeating a commit or a PR creation", async () => {
  const { readFile } = await import("node:fs/promises");
  const history: Session = JSON.parse(await readFile(new URL("../fixtures/prSessionHistory.json", import.meta.url), "utf8"));
  const queued = [shellCall("npm run test"), shellCall(local), shellCall(view), final];
  const executed: string[] = [];
  const modelInputs: string[] = [];
  const agent = createAgent({
    session: history, beforeFinish: requireVerification, maxSteps: queued.length,
    model: { async generate(messages) { modelInputs.push(messages.at(-1)!.content); return queued.shift()!; } },
    tools: [{ name: "bash", description: "offline readback", schema: z.object({ command: z.string() }),
      async execute({ command }) {
        executed.push(command);
        if (command !== "npm run test") return receipt(command, results[command]);
        const checked = receipt(command, "196 passed", false);
        checked.effects!.command!.verification = true;
        return checked;
      } }]
  });
  const result = await agent.run("继续", { continuation: true });
  expect(modelInputs[0]).toContain("单独运行 npm run test");
  expect(modelInputs[0]).toContain(trace.url);
  expect(executed).toEqual(["npm run test", local, view]);
  expect(result).toMatchObject({ status: "complete", answer: final.text });
});
