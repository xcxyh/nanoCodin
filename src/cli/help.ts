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
    "",
    "Config override flags",
    "  --max-steps <n>",
    "  --recursion-limit <n>",
    "  --sandbox-policy <allow|ask|deny>",
    "  --sandbox-timeout-ms <n>",
    "  --compression-threshold <0..1>",
    "  --verify-keywords <a,b,c>",
    "",
    "Examples",
    "  nano-codin",
    "  nano-codin \"inspect the repo and propose a plan\"",
    "  nano-codin --cwd ../other-repo --prompt \"fix failing tests\"",
    "  nano-codin --resume",
    "  nano-codin --print-config",
    "",
    "Config precedence",
    "  CLI flags > shell env > ~/.nanocodin/config.yaml > AGENTS.md guidelines > defaults"
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
    `  baseUrl: ${config.model.baseUrl ?? "(default)"}`,
    `  apiKey: ${config.model.apiKey ? "(configured)" : "(missing)"}`,
    "",
    "Agent",
    `  maxSteps: ${config.agent.maxSteps}`,
    `  recursionLimit: ${config.agent.recursionLimit}`,
    `  compressionThresholdRatio: ${config.agent.compression.tokenThresholdRatio}`,
    `  verifyRequiredKeywords: ${config.agent.verifyRequiredKeywords.join(", ") || "(none)"}`,
    "",
    "Sandbox",
    `  defaultPolicy: ${config.sandbox.defaultPolicy}`,
    `  timeoutMs: ${config.sandbox.timeoutMs}`,
    "",
    "Repo index",
    `  enabled: ${config.repoIndex.enabled ? "true" : "false"}`,
    `  maxBytes: ${config.repoIndex.maxBytes}`,
    "",
    "Precedence",
    "  CLI flags > shell env > ~/.nanocodin/config.yaml > AGENTS.md guidelines > defaults"
  ].join("\n");
}
