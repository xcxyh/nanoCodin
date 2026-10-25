import { createServer, type Server } from "node:http";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { execa } from "execa";
import { describe, expect, it } from "vitest";

interface Reply { calls?: Array<{ name: string; input: unknown }>; text?: string; unsupported?: boolean }

async function withEndpoint(replies: Reply[], task: (baseUrl: string, requests: Array<Record<string, unknown>>) => Promise<void>) {
  const requests: Array<Record<string, unknown>> = [];
  const server: Server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += String(chunk);
    requests.push(JSON.parse(body));
    const reply = replies.shift();
    response.setHeader("Content-Type", "application/json");
    if (!reply || reply.unsupported) {
      response.statusCode = reply ? 400 : 500;
      response.end(JSON.stringify({ error: { message: reply ? "tools unsupported by this endpoint" : "Unexpected extra request" } }));
      return;
    }
    response.end(JSON.stringify({
      id: "test-completion", object: "chat.completion", created: 1, model: "test-model",
      choices: [{ index: 0, finish_reason: reply.calls ? "tool_calls" : "stop", message: {
        role: "assistant", content: reply.text ?? null,
        ...(reply.calls ? { tool_calls: reply.calls.map((call, index) => ({ id: `call-${index}`, type: "function", function: { name: call.name, arguments: JSON.stringify(call.input) } })) } : {})
      } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
    }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No local server address");
  try { await task(`http://127.0.0.1:${address.port}/v1`, requests); }
  finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
}

async function workspace(baseUrl: string) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "nanocodin-cli-"));
  const home = await mkdtemp(path.join(os.tmpdir(), "nanocodin-cli-home-"));
  const env = {
    ...process.env, NANOCODIN_HOME: home, MODEL_PROVIDER: "openai", MODEL_NAME: "test-model",
    MODEL_API_KEY: "local-test-key", MODEL_BASE_URL: baseUrl, NANOCODIN_TEXT_REACT: "0"
  };
  const entry = path.resolve("src/index.ts");
  const run = (...args: string[]) => execa(process.execPath, ["--import", "tsx", entry, "--cwd", cwd, "--print", "--sandbox-policy", "allow", ...args], { env, reject: false, timeout: 20_000 });
  return { cwd, home, run };
}

const code = { name: "create", input: { path: "solution.js", content: "export const add = (a, b) => a + b;\n" } };
const verify = { name: "bash", input: { command: "node --check solution.js", purpose: "verify" } };
const done = { name: "final", input: { answer: "已创建加法函数，语法检查通过。" } };

describe("real CLI and OpenAI-compatible HTTP transport", () => {
  it("recovers from an unavailable SDK tool, executes a complete batch, and retains its session", async () => {
    await withEndpoint([
      { calls: [{ name: "read_file", input: { path: "solution.js" } }] },
      { calls: [code, verify] }, { calls: [done] }
    ], async (baseUrl, requests) => {
      const { run, cwd, home } = await workspace(baseUrl);
      const result = await run("--prompt", "创建加法函数并检查");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("已创建加法函数，语法检查通过。");
      expect(result.stderr).toBe("");
      expect(await readFile(path.join(cwd, "solution.js"), "utf8")).toContain("a + b");
      const workspaceId = (await readdir(path.join(home, "workspaces")))[0];
      const directory = path.join(home, "workspaces", workspaceId, "sessions");
      const id = (await readFile(path.join(directory, "latest"), "utf8")).trim();
      const saved = JSON.parse(await readFile(path.join(directory, `${id}.json`), "utf8"));
      expect(saved.events.at(-1)).toMatchObject({ type: "finish", status: "complete" });
      const command = saved.events.find((event: any) => event.type === "tool_end" && event.result.effects?.command);
      expect(command.result.effects.command.exitCode).toBe(0);
      expect(saved.events.some((event: any) => event.type === "notice" && event.text.includes("No tools were executed"))).toBe(true);
      expect(JSON.stringify(requests[1])).toContain("available tool names");
    });
  }, 30_000);

  it("falls back once for an endpoint without tools, then uses schema-guided multiline text actions", async () => {
    await withEndpoint([
      { unsupported: true },
      { text: `Thought: create\nAction: create\nAction Input: ${JSON.stringify(code.input, null, 2)}` },
      { text: `Thought: check\nAction: bash\nAction Input: ${JSON.stringify(verify.input)}` },
      { text: `Action: final\nAction Input: ${JSON.stringify(done.input)}` }
    ], async (baseUrl, requests) => {
      const { run } = await workspace(baseUrl);
      const result = await run("--prompt", "创建加法函数并检查");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe(done.input.answer);
      expect(requests.filter((request) => request.tools)).toHaveLength(1);
      expect(JSON.stringify(requests[1])).toContain('oldText');
    });
  }, 30_000);

  it("loads an editable project Handlebars template with rules and selected skills", async () => {
    await withEndpoint([{ calls: [{ name: "final", input: { answer: "模板已加载" } }] }], async (baseUrl, requests) => {
      const { run, cwd, home } = await workspace(baseUrl);
      await mkdir(path.join(home, "prompts"), { recursive: true });
      await writeFile(path.join(home, "prompts", "system.hbs"), "USER_TEMPLATE_ONLY");
      await mkdir(path.join(cwd, ".nanocodin", "prompts"), { recursive: true });
      await writeFile(path.join(cwd, ".nanocodin", "prompts", "system.hbs"), "PROJECT_TEMPLATE {{task}}\n{{projectRules}}\n{{#each selectedSkills}}{{name}}: {{content}}{{/each}}");
      await writeFile(path.join(cwd, "AGENTS.md"), 'Keep "quotes" and x < y && z.');
      const skill = path.join(cwd, ".agents", "skills", "prompt-test"); await mkdir(skill, { recursive: true });
      await writeFile(path.join(skill, "SKILL.md"), "---\nname: prompt-test\ndescription: fixture\n---\nSELECTED <skill> & body");
      const result = await run("--prompt", "$prompt-test 检查上下文");
      expect(result.exitCode).toBe(0); expect(result.stdout).toBe("模板已加载");
      const content = (requests[0].messages as Array<{ content: string }>).map((message) => message.content).join("\n");
      expect(content).toContain("PROJECT_TEMPLATE $prompt-test 检查上下文");
      expect(content).toContain('Keep "quotes" and x < y && z.');
      expect(content).toContain("SELECTED <skill> & body");
      expect(content).not.toContain("USER_TEMPLATE_ONLY");
      expect(content).not.toMatch(/&quot;|&lt;/);
    });
  }, 30_000);

  it("returns an incomplete exit code on a budget stop and resumes in another process", async () => {
    await withEndpoint([{ calls: [code] }, { calls: [verify] }, { calls: [done] }], async (baseUrl) => {
      const { run } = await workspace(baseUrl);
      const stopped = await run("--max-steps", "1", "--prompt", "创建加法函数并检查");
      expect(stopped.exitCode).toBe(2);
      expect(stopped.stdout).toContain("尚未完成");
      const resumed = await run("--resume");
      expect(resumed.exitCode).toBe(0);
      expect(resumed.stdout).toBe(done.input.answer);
    });
  }, 30_000);
});
