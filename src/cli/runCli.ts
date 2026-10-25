import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAgent } from "../agent/run.js";
import { runBootstrap } from "../bootstrap/runBootstrap.js";
import { loadRuntimeConfig, isModelConfigComplete } from "../config/load.js";
import { loadSkills } from "../context/skills.js";
import { buildSlashCommands } from "../ui/utils/slashCommands.js";
import { loadFileSuggestions } from "../ui/fileSuggestions.js";
import { loadProjectContext } from "../context/project.js";
import type { ToolContext } from "../core/toolTypes.js";
import { createModelProvider, getConfiguredModelName } from "../model/provider.js";
import { FileSessionStore } from "../session/store.js";
import { formatSessionReview } from "../session/review.js";
import { createDefaultTools } from "../tools/index.js";
import { requireVerification } from "../workflows/verification.js";
import { formatConfigText, formatHelpText, getCliVersion } from "./help.js";
import { parseCliArgs } from "./parseArgs.js";
import { resolveNanoCodinHome } from "../config/paths.js";
import { createTemplateInstructions } from "../templates/index.js";

export interface CliIo { stdout(message: string): void; stderr(message: string): void }
const defaultIo: CliIo = { stdout: (text) => process.stdout.write(`${text}\n`), stderr: (text) => process.stderr.write(`${text}\n`) };

export async function runCli(argv: string[], io: CliIo = defaultIo, baseCwd = process.cwd(), interactive = Boolean(process.stdin.isTTY)): Promise<number> {
  const parsed = parseCliArgs(argv, baseCwd);
  if (!parsed.ok || !parsed.args) { io.stderr(parsed.error ?? "CLI arguments unavailable."); return 1; }
  const args = parsed.args;
  for (const warning of args.warnings) io.stderr(warning);
  if (args.printHelp) { io.stdout(formatHelpText()); return 0; }
  if (args.printVersion) { io.stdout(getCliVersion()); return 0; }
  const store = new FileSessionStore(args.cwd);
  if (args.review.enabled) {
    const session = await store.load(args.review.sessionId ?? undefined);
    if (!session) { io.stderr("找不到会话记录。"); return 1; }
    io.stdout(formatSessionReview(session)); return 0;
  }
  let runtime = loadRuntimeConfig(args.cwd, args.configArgv);
  if (args.printConfig) { io.stdout(formatConfigText(runtime, args)); return 0; }
  const print = args.printResult || !interactive;
  if (print && !args.prompt && !args.resume.enabled) { io.stderr("请提供任务，或使用 --resume。交互模式请在终端运行 nano-codin。"); return 1; }
  if (!isModelConfigComplete(runtime.config.model)) {
    if (print) { io.stderr("模型配置不完整。请设置 MODEL_PROVIDER、MODEL_NAME、MODEL_API_KEY，或在终端运行配置向导。"); return 1; }
    await runBootstrap(runtime.config, args.cwd, io);
    runtime = loadRuntimeConfig(args.cwd, args.configArgv);
  }
  const restored = args.resume.enabled ? await store.load(args.resume.sessionId ?? undefined) : null;
  if (args.resume.enabled && !restored) {
    const sessions = await store.list();
    io.stderr(`Checkpoint not found: ${args.resume.sessionId ?? "latest"}${sessions.length ? `\n${sessions.map((item) => `${item.id} ${item.task}`).join("\n")}` : "\nNo resumable sessions found."}`); return 1;
  }
  const model = createModelProvider(runtime.config.model);
  const templateFile = [
    path.join(args.cwd, ".nanocodin", "prompts", "system.hbs"),
    path.join(resolveNanoCodinHome(), "prompts", "system.hbs")
  ].find((file) => existsSync(file)) ?? fileURLToPath(new URL("../prompts/system.hbs", import.meta.url));
  const instructions = createTemplateInstructions({
    file: templateFile,
    data: (task, current) => loadProjectContext(args.cwd, task, current)
  });
  let initialSession = restored;
  const makeAgent = (ask?: ToolContext["ask"]) => {
    const session = initialSession ?? undefined; initialSession = null;
    return createAgent({
      model, tools: createDefaultTools(runtime.config.sandbox), cwd: args.cwd, session,
      maxSteps: runtime.config.agent.maxSteps, maxHistoryChars: runtime.config.agent.maxHistoryChars,
      instructions,
      ask, save: (current) => store.save(current), beforeFinish: requireVerification
    });
  };
  if (print) {
    const abort = new AbortController();
    const cancel = () => abort.abort(); process.once("SIGINT", cancel);
    try {
      const result = await makeAgent().run(args.prompt ?? "continue", { signal: abort.signal, continuation: args.resume.enabled });
      io.stdout(result.answer);
      if (result.persistenceError) io.stderr(`会话保存失败：${result.persistenceError}`);
      return result.status === "complete" ? 0 : result.status === "incomplete" ? 2 : result.status === "cancelled" ? 130 : 1;
    } finally { process.removeListener("SIGINT", cancel); }
  }
  const [{ render }, React, { App }] = await Promise.all([import("ink"), import("react"), import("../ui/App.js")]);
  render(React.createElement(App, { makeAgent, task: args.prompt ?? undefined, resume: args.resume.enabled, modelName: getConfiguredModelName(runtime.config.model), version: getCliVersion(),
    loadFiles: (signal: AbortSignal) => loadFileSuggestions(args.cwd, signal),
    loadCommands: async () => buildSlashCommands(await loadSkills(args.cwd))
  }), { exitOnCtrlC: false });
  return 0;
}
