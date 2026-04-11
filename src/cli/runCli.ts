import { render } from "ink";
import React from "react";
import { CodingAgentGraph } from "../agent/agentGraph.js";
import { runBootstrap } from "../bootstrap/runBootstrap.js";
import { createModelProvider, getConfiguredModelName } from "../llm/modelRouter.js";
import { createEmptyTodoState, type ToolContext } from "../core/toolTypes.js";
import { createDefaultToolRegistry } from "../tools/registry.js";
import { ConsoleApp } from "../ui/consoleApp.js";
import { isModelConfigComplete, loadRuntimeConfig } from "../services/configLoader.js";
import { loadContextSources } from "../services/contextLoader.js";
import { RepoIndexer } from "../services/repoIndexer.js";
import { PermissionController } from "../core/permission.js";
import { FileSessionCheckpointStore } from "../services/sessionCheckpoint.js";
import { formatSkillsForPrompt, loadSkills } from "../services/skills.js";
import { ensureWorkspaceState } from "../services/workspaceState.js";
import { buildSlashCommands } from "../ui/utils/slashCommands.js";
import { parsePositiveIntEnv } from "./runtimeEnv.js";
import { formatConfigText, formatHelpText, getCliVersion } from "./help.js";
import { parseCliArgs } from "./parseArgs.js";

export interface CliIo {
  stdout(message: string): void;
  stderr(message: string): void;
}

export async function runCli(argv: string[], io: CliIo = defaultIo, baseCwd = process.cwd()): Promise<number> {
  const parsed = parseCliArgs(argv, baseCwd);
  if (!parsed.ok) {
    io.stderr(parsed.error ?? "Unknown CLI parse error.");
    return 1;
  }

  const args = parsed.args;
  if (!args) {
    io.stderr("CLI arguments were not available after parsing.");
    return 1;
  }
  for (const warning of args.warnings) {
    io.stderr(`Warning: ${warning}`);
  }

  if (args.printHelp) {
    io.stdout(formatHelpText());
    return 0;
  }

  if (args.printVersion) {
    io.stdout(getCliVersion());
    return 0;
  }

  process.chdir(args.cwd);
  let runtime = loadRuntimeConfig(args.cwd, args.configArgv);
  if (args.printConfig) {
    io.stdout(formatConfigText(runtime, args));
    return 0;
  }

  if (!runtime.sources.configYamlExists || !isModelConfigComplete(runtime.config.model)) {
    await runBootstrap(runtime.config, args.cwd, io);
    runtime = loadRuntimeConfig(args.cwd, args.configArgv);
  }

  await ensureWorkspaceState(args.cwd);

  const checkpoint = new FileSessionCheckpointStore(args.cwd);
  if (args.resume.enabled) {
    const restored = await checkpoint.load(args.resume.sessionId ?? undefined);
    if (!restored) {
      const sessions = await checkpoint.list();
      const available = sessions.length === 0
        ? "No resumable checkpoints found. Start a new task or use --new-session."
        : `Available checkpoints:\n${sessions.map((session) => `  ${session.id}  ${session.task}`).join("\n")}`;
      io.stderr(
        args.resume.sessionId
          ? `Checkpoint not found: ${args.resume.sessionId}\n${available}`
          : available
      );
      return 1;
    }
  }

  const context = loadContextSources(args.cwd);
  const skills = await loadSkills(args.cwd);
  const slashCommands = buildSlashCommands(skills);
  context.sources.availableSkills = formatSkillsForPrompt(skills);
  const version = getCliVersion();
  const modelName = getConfiguredModelName(runtime.config.model);
  const model = createModelProvider(runtime.config.model);
  const repoIndexer = new RepoIndexer(args.cwd, runtime.config.repoIndex);
  const tools = createDefaultToolRegistry();
  const permissionController = new PermissionController();
  const maxSteps = runtime.config.agent.maxSteps ?? parsePositiveIntEnv(process.env.AGENT_MAX_STEPS, 12);
  const recursionLimit = runtime.config.agent.recursionLimit ?? parsePositiveIntEnv(process.env.AGENT_RECURSION_LIMIT, maxSteps * 2 + 8);

  const toolContext: ToolContext = {
    cwd: args.cwd,
    todos: createEmptyTodoState(),
    runtimeConfig: runtime.config,
    repoIndex: repoIndexer,
    commandLogs: [],
    sessionMemory: null,
    contextSources: context.sources,
    permission: permissionController,
    checkpoint
  };

  await repoIndexer.init().catch(() => undefined);

  const graph = new CodingAgentGraph(model, tools, toolContext, maxSteps, recursionLimit);
  render(React.createElement(ConsoleApp, {
    graph,
    permissionController,
    modelName,
    version,
    cwd: args.cwd,
    checkpoint,
    slashCommands,
    initialTask: args.prompt ?? undefined,
    resumeSessionId: args.resume.enabled ? (args.resume.sessionId ?? "__LATEST__") : undefined,
    disableCheckpointRestore: args.newSession
  }));

  return 0;
}

const defaultIo: CliIo = {
  stdout: (message) => process.stdout.write(`${message}\n`),
  stderr: (message) => process.stderr.write(`${message}\n`)
};
