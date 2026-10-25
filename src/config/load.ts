import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { DEFAULT_RUNTIME_CONFIG, type ModelProviderName, type ResolvedModelConfig, type ResolvedRuntimeConfig, type ResolvedRuntimeConfigResult } from "../core/runtimeConfig.js";
import { resolveContextFilePaths } from "../context/project.js";
import { resolveNanoCodinPaths } from "./paths.js";
import { parseSimpleYaml, stringifySimpleYaml } from "./yaml.js";

const integer = (min: number, max = Number.MAX_SAFE_INTEGER) => z.number().finite().transform((value) => Math.max(min, Math.min(max, Math.floor(value))));

const configSchema = z.object({
  model: z.object({
    provider: z.enum(["openai", "anthropic"]).optional(),
    name: z.string().min(1).optional(),
    baseUrl: z.string().nullable().optional(),
    apiKey: z.string().nullable().optional()
  }).optional(),
  agent: z.object({
    maxSteps: integer(1).optional(),
    maxHistoryChars: integer(1000).optional()
  }).optional(),
  sandbox: z.object({
    defaultPolicy: z.enum(["allow", "ask", "deny"]).optional(),
    timeoutMs: integer(1000, 120000).optional(),
    maxOutputBytes: integer(1024).optional(),
    denyPatterns: z.array(z.string()).optional(),
    askPrefixes: z.array(z.string()).optional(),
    allowPrefixes: z.array(z.string()).optional()
  }).optional()
});

// One schema handles YAML, environment and CLI. Old, removed feature keys are ignored.
function applyPatch(config: ResolvedRuntimeConfig, raw: unknown): void {
  const result = configSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid nano-codin config: ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
  }
  const patch = result.data;
  Object.assign(config.model, patch.model);
  Object.assign(config.sandbox, patch.sandbox);
  if (patch.agent?.maxSteps !== undefined) config.agent.maxSteps = patch.agent.maxSteps;
  if (patch.agent?.maxHistoryChars !== undefined) config.agent.maxHistoryChars = patch.agent.maxHistoryChars;
}

export function parseCliOverrides(argv: string[]): Record<string, string> {
  return Object.fromEntries(argv.filter((arg) => arg.startsWith("--") && arg.includes("=")).map((arg) => {
    const index = arg.indexOf("=");
    return [arg.slice(2, index), arg.slice(index + 1)];
  }));
}

export function isModelConfigComplete(model: ResolvedModelConfig): boolean {
  return Boolean(model.provider && model.name && model.apiKey);
}

export function serializeConfigYaml(config: ResolvedRuntimeConfig): string {
  return `${stringifySimpleYaml({ model: { ...config.model }, agent: { ...config.agent }, sandbox: { ...config.sandbox } })}\n`;
}

export function normalizeModelProvider(value: string | undefined, fallback: ModelProviderName = "openai"): ModelProviderName {
  return value === "anthropic" || value === "openai" ? value : fallback;
}

export function loadRuntimeConfig(cwd: string, argv: string[] = process.argv.slice(2)): ResolvedRuntimeConfigResult {
  const config: ResolvedRuntimeConfig = structuredClone(DEFAULT_RUNTIME_CONFIG);
  const paths = resolveNanoCodinPaths(cwd);
  const contextPaths = resolveContextFilePaths(cwd);
  const configYamlExists = existsSync(paths.configYamlPath);
  if (configYamlExists) applyPatch(config, parseSimpleYaml(readFileSync(paths.configYamlPath, "utf8")));
  const env = process.env;
  const provider = normalizeModelProvider(env.MODEL_PROVIDER, config.model.provider ?? "openai");
  const model: ResolvedModelConfig = {
    provider,
    name: env.MODEL_NAME ?? (provider === "openai" ? env.OPENAI_MODEL : env.ANTHROPIC_MODEL) ?? config.model.name,
    baseUrl: env.MODEL_BASE_URL ?? (provider === "openai" ? env.OPENAI_BASE_URL : env.ANTHROPIC_BASE_URL) ?? config.model.baseUrl,
    apiKey: env.MODEL_API_KEY ?? (provider === "openai" ? env.OPENAI_API_KEY : env.ANTHROPIC_API_KEY) ?? config.model.apiKey
  };
  applyPatch(config, { model });
  if (env.AGENT_MAX_STEPS && /^\d+$/.test(env.AGENT_MAX_STEPS) && Number(env.AGENT_MAX_STEPS) > 0) {
    applyPatch(config, { agent: { maxSteps: Number(env.AGENT_MAX_STEPS) } });
  }
  const cli = parseCliOverrides(argv);
  for (const [flag, value] of Object.entries(cli)) {
    if (flag === "max-steps") {
      if (!/^\d+$/.test(value) || Number(value) < 1) throw new Error("--max-steps must be a positive integer.");
      applyPatch(config, { agent: { maxSteps: Number(value) } });
    } else if (flag === "sandbox-policy") {
      applyPatch(config, { sandbox: { defaultPolicy: value } });
    } else if (flag === "sandbox-timeout-ms") {
      if (!/^\d+$/.test(value)) throw new Error("--sandbox-timeout-ms must be an integer.");
      applyPatch(config, { sandbox: { timeoutMs: Number(value) } });
    }
  }
  return {
    config,
    sources: {
      configYamlPath: paths.configYamlPath, configYamlExists,
      workspaceStateDir: paths.workspaceStateDir, workspaceId: paths.workspaceId,
      agentsPath: contextPaths.agentsPath, contextPath: contextPaths.contextPath, memoryPath: contextPaths.memoryPath
    }
  };
}
