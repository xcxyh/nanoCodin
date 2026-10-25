import { displayEndpoint } from "../config/model.js";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ParsedCliArgs } from "./parseArgs.js";
import type { ResolvedRuntimeConfigResult } from "../core/runtimeConfig.js";

const packageJsonPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../package.json");

export function getCliVersion(): string {
  const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version?: string };
  return pkg.version ?? "0.0.0";
}

export function formatHelpText(): string {
  return [
    "Usage",
    "  nano-codin",
    "  nano-codin \"fix test failure\"",
    "  nano-codin --prompt \"fix test failure\"",
    "  nano-codin --resume [session-id]",
    "  nano-codin --print-config",
    "",
    "Common flags",
    "  -h, --help                 Show help and exit",
    "  -v, --version              Show version and exit",
    "  --cwd <path>               Run nano-codin against a specific workspace",
    "  --prompt <text>            Start with an initial task",
    "  --resume [session-id]      Resume the latest or a named checkpoint",
    "  --new-session              Ignore resumable checkpoint state",
    "  --print-config             Print effective config and source paths",
    "  --print                    Run once without TUI; print only the final answer",
    "  --review [session-id]      Inspect local session evidence without calling a model",
    "",
    "Config override flags",
    "  --max-steps <n>",
    "  --model-timeout-ms <n>     Total model request budget (including retries)",
    "  --model-idle-timeout-ms <n> Model response inactivity budget",
    "  --model-max-retries <n>    Transport retries, 0-5",
    "  --sandbox-policy <allow|ask|deny>",
    "  --sandbox-timeout-ms <n>",
    "",
    "Examples",
    "  nano-codin",
    "  nano-codin \"inspect the repo and propose a plan\"",
    "  nano-codin --cwd ../other-repo --prompt \"fix failing tests\"",
    "  nano-codin --resume",
    "  nano-codin --print-config",
    "",
    "Config precedence",
    "  CLI flags > shell env > ~/.nanocodin/config.yaml > defaults"
  ].join("\n");
}

export function formatConfigText(runtime: ResolvedRuntimeConfigResult, args: ParsedCliArgs): string {
  const { config, sources } = runtime;
  return [
    "Effective config",
    `  cwd: ${args.cwd}`,
    `  prompt: ${args.prompt ?? "(none)"}`,
    `  resume: ${args.resume.enabled ? (args.resume.sessionId ?? "latest") : "disabled"}`,
    `  newSession: ${args.newSession ? "true" : "false"}`,
    "",
    "Sources",
    `  configYamlPath: ${sources.configYamlPath}`,
    `  configYamlExists: ${sources.configYamlExists ? "true" : "false"}`,
    `  workspaceStateDir: ${sources.workspaceStateDir}`,
    `  workspaceId: ${sources.workspaceId}`,
    `  agentsPath: ${sources.agentsPath}`,
    `  contextPath: ${sources.contextPath}`,
    `  memoryPath: ${sources.memoryPath}`,
    "",
    "Model",
    `  provider: ${config.model.provider}`,
    `  name: ${config.model.name}`,
    `  baseUrl: ${displayEndpoint(config.model.baseUrl)}`,
    `  requestTimeoutMs: ${config.model.requestTimeoutMs}`,
    `  idleTimeoutMs: ${config.model.idleTimeoutMs}`,
    `  maxRetries: ${config.model.maxRetries}`,
    `  apiKey: ${config.model.apiKey ? "(configured)" : "(missing)"}`,
    "",
    "Agent",
    `  maxSteps: ${config.agent.maxSteps}`,
    `  maxHistoryChars: ${config.agent.maxHistoryChars}`,
    "",
    "Sandbox",
    `  defaultPolicy: ${config.sandbox.defaultPolicy}`,
    `  timeoutMs: ${config.sandbox.timeoutMs}`,
    "",
    "Precedence",
    "  CLI flags > shell env > ~/.nanocodin/config.yaml > defaults"
  ].join("\n");
}
