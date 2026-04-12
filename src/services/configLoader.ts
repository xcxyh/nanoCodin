import { existsSync, readFileSync } from "node:fs";
import {
  DEFAULT_RUNTIME_CONFIG,
  type ModelProviderName,
  type ResolvedModelConfig,
  type ResolvedRuntimeConfig,
  type ResolvedRuntimeConfigResult,
  type SandboxPolicyDecision
} from "../core/runtimeConfig.js";
import { parseAgentsGuidelines, resolveContextFilePaths } from "./contextLoader.js";
import { resolveNanoCodinPaths } from "./userPaths.js";
import { parseSimpleYaml, stringifySimpleYaml } from "./yamlConfig.js";

interface CliOverrides {
  maxSteps?: number;
  recursionLimit?: number;
  sandboxPolicy?: SandboxPolicyDecision;
  sandboxTimeoutMs?: number;
  compressionThresholdRatio?: number;
  verifyKeywords?: string[];
}

interface RuntimeConfigPatch {
  model?: Partial<ResolvedModelConfig>;
  agent?: {
    maxSteps?: number;
    recursionLimit?: number;
    verifyRequiredKeywords?: string[];
    phaseLimits?: {
      discover?: number;
      plan?: number;
      executeVerify?: number;
    };
    compression?: {
      enabled?: boolean;
      tokenThresholdRatio?: number;
      retainRecentRatio?: number;
      contextTokenBudget?: number;
    };
  };
  sandbox?: Partial<ResolvedRuntimeConfig["sandbox"]>;
  repoIndex?: Partial<ResolvedRuntimeConfig["repoIndex"]>;
  recovery?: Partial<ResolvedRuntimeConfig["recovery"]>;
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

function parseRatio(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
    return undefined;
  }
  return parsed;
}

function cloneDefaultConfig(): ResolvedRuntimeConfig {
  return JSON.parse(JSON.stringify(DEFAULT_RUNTIME_CONFIG)) as ResolvedRuntimeConfig;
}

export function parseCliOverrides(argv: string[]): CliOverrides {
  const overrides: CliOverrides = {};
  for (const rawArg of argv) {
    if (!rawArg.startsWith("--")) {
      continue;
    }
    const arg = rawArg.slice(2);
    const [key, value = ""] = arg.split("=", 2);
    if (key === "max-steps") {
      overrides.maxSteps = parsePositiveInt(value);
    } else if (key === "recursion-limit") {
      overrides.recursionLimit = parsePositiveInt(value);
    } else if (key === "sandbox-policy" && (value === "allow" || value === "ask" || value === "deny")) {
      overrides.sandboxPolicy = value;
    } else if (key === "sandbox-timeout-ms") {
      overrides.sandboxTimeoutMs = parsePositiveInt(value);
    } else if (key === "compression-threshold") {
      overrides.compressionThresholdRatio = parseRatio(value);
    } else if (key === "verify-keywords") {
      const list = value.split(",").map((item) => item.trim()).filter(Boolean);
      overrides.verifyKeywords = list.length > 0 ? list : undefined;
    }
  }
  return overrides;
}

export function applyValue(config: ResolvedRuntimeConfig, key: string, value: unknown): void {
  if (key === "model.provider" && (value === "openai" || value === "anthropic")) {
    config.model.provider = value;
  } else if (key === "model.name" && typeof value === "string" && value.length > 0) {
    config.model.name = value;
  } else if (key === "model.base_url" && typeof value === "string") {
    config.model.baseUrl = value || null;
  } else if (key === "model.api_key" && typeof value === "string") {
    config.model.apiKey = value || null;
  } else if (key === "agent.max_steps" && typeof value === "number") {
    config.agent.maxSteps = Math.max(1, Math.floor(value));
  } else if (key === "agent.recursion_limit" && typeof value === "number") {
    config.agent.recursionLimit = Math.max(2, Math.floor(value));
  } else if (key === "agent.verify_required_keywords" && Array.isArray(value)) {
    config.agent.verifyRequiredKeywords = value.filter((item): item is string => typeof item === "string" && item.length > 0);
  } else if (key === "agent.phase_limits.discover" && typeof value === "number") {
    config.agent.phaseLimits.discover = Math.max(1, Math.floor(value));
  } else if (key === "agent.phase_limits.plan" && typeof value === "number") {
    config.agent.phaseLimits.plan = Math.max(1, Math.floor(value));
  } else if (key === "agent.phase_limits.execute_verify" && typeof value === "number") {
    config.agent.phaseLimits.executeVerify = Math.max(1, Math.floor(value));
  } else if (key === "sandbox.default_policy" && (value === "allow" || value === "ask" || value === "deny")) {
    config.sandbox.defaultPolicy = value;
  } else if (key === "sandbox.deny_patterns" && Array.isArray(value)) {
    config.sandbox.denyPatterns = value.filter((item): item is string => typeof item === "string");
  } else if (key === "sandbox.ask_prefixes" && Array.isArray(value)) {
    config.sandbox.askPrefixes = value.filter((item): item is string => typeof item === "string");
  } else if (key === "sandbox.allow_prefixes" && Array.isArray(value)) {
    config.sandbox.allowPrefixes = value.filter((item): item is string => typeof item === "string");
  } else if (key === "sandbox.timeout_ms" && typeof value === "number") {
    config.sandbox.timeoutMs = Math.max(1000, Math.min(120000, Math.floor(value)));
  } else if (key === "sandbox.max_output_bytes" && typeof value === "number") {
    config.sandbox.maxOutputBytes = Math.max(1024, Math.floor(value));
  } else if (key === "repo_index.enabled" && typeof value === "boolean") {
    config.repoIndex.enabled = value;
  } else if (key === "repo_index.max_bytes" && typeof value === "number") {
    config.repoIndex.maxBytes = Math.max(100_000, Math.floor(value));
  } else if (key === "repo_index.ignore" && Array.isArray(value)) {
    config.repoIndex.ignore = value.filter((item): item is string => typeof item === "string");
  } else if (key === "recovery.enabled" && typeof value === "boolean") {
    config.recovery.enabled = value;
  } else if (key === "recovery.max_retry_per_step" && typeof value === "number") {
    config.recovery.maxRetryPerStep = Math.max(0, Math.floor(value));
  } else if (key === "recovery.dedupe_window_steps" && typeof value === "number") {
    config.recovery.dedupeWindowSteps = Math.max(1, Math.floor(value));
  } else if (key === "compression.enabled" && typeof value === "boolean") {
    config.agent.compression.enabled = value;
  } else if (key === "compression.token_threshold_ratio" && typeof value === "number") {
    config.agent.compression.tokenThresholdRatio = Math.max(0.1, Math.min(1, value));
  } else if (key === "compression.retain_recent_ratio" && typeof value === "number") {
    config.agent.compression.retainRecentRatio = Math.max(0.2, Math.min(0.9, value));
  } else if (key === "compression.context_token_budget" && typeof value === "number") {
    config.agent.compression.contextTokenBudget = Math.max(1000, Math.floor(value));
  }
}

function applyPatch(config: ResolvedRuntimeConfig, patch: RuntimeConfigPatch): void {
  if (patch.model?.provider) {
    applyValue(config, "model.provider", patch.model.provider);
  }
  if (typeof patch.model?.name === "string") {
    applyValue(config, "model.name", patch.model.name);
  }
  if (typeof patch.model?.baseUrl === "string" || patch.model?.baseUrl === null) {
    applyValue(config, "model.base_url", patch.model.baseUrl ?? "");
  }
  if (typeof patch.model?.apiKey === "string" || patch.model?.apiKey === null) {
    applyValue(config, "model.api_key", patch.model.apiKey ?? "");
  }

  if (typeof patch.agent?.maxSteps === "number") {
    applyValue(config, "agent.max_steps", patch.agent.maxSteps);
  }
  if (typeof patch.agent?.recursionLimit === "number") {
    applyValue(config, "agent.recursion_limit", patch.agent.recursionLimit);
  }
  if (Array.isArray(patch.agent?.verifyRequiredKeywords)) {
    applyValue(config, "agent.verify_required_keywords", patch.agent.verifyRequiredKeywords);
  }
  if (typeof patch.agent?.phaseLimits?.discover === "number") {
    applyValue(config, "agent.phase_limits.discover", patch.agent.phaseLimits.discover);
  }
  if (typeof patch.agent?.phaseLimits?.plan === "number") {
    applyValue(config, "agent.phase_limits.plan", patch.agent.phaseLimits.plan);
  }
  if (typeof patch.agent?.phaseLimits?.executeVerify === "number") {
    applyValue(config, "agent.phase_limits.execute_verify", patch.agent.phaseLimits.executeVerify);
  }
  if (typeof patch.agent?.compression?.enabled === "boolean") {
    applyValue(config, "compression.enabled", patch.agent.compression.enabled);
  }
  if (typeof patch.agent?.compression?.tokenThresholdRatio === "number") {
    applyValue(config, "compression.token_threshold_ratio", patch.agent.compression.tokenThresholdRatio);
  }
  if (typeof patch.agent?.compression?.retainRecentRatio === "number") {
    applyValue(config, "compression.retain_recent_ratio", patch.agent.compression.retainRecentRatio);
  }
  if (typeof patch.agent?.compression?.contextTokenBudget === "number") {
    applyValue(config, "compression.context_token_budget", patch.agent.compression.contextTokenBudget);
  }

  if (patch.sandbox?.defaultPolicy) {
    applyValue(config, "sandbox.default_policy", patch.sandbox.defaultPolicy);
  }
  if (Array.isArray(patch.sandbox?.denyPatterns)) {
    applyValue(config, "sandbox.deny_patterns", patch.sandbox.denyPatterns);
  }
  if (Array.isArray(patch.sandbox?.askPrefixes)) {
    applyValue(config, "sandbox.ask_prefixes", patch.sandbox.askPrefixes);
  }
  if (Array.isArray(patch.sandbox?.allowPrefixes)) {
    applyValue(config, "sandbox.allow_prefixes", patch.sandbox.allowPrefixes);
  }
  if (typeof patch.sandbox?.timeoutMs === "number") {
    applyValue(config, "sandbox.timeout_ms", patch.sandbox.timeoutMs);
  }
  if (typeof patch.sandbox?.maxOutputBytes === "number") {
    applyValue(config, "sandbox.max_output_bytes", patch.sandbox.maxOutputBytes);
  }

  if (typeof patch.repoIndex?.enabled === "boolean") {
    applyValue(config, "repo_index.enabled", patch.repoIndex.enabled);
  }
  if (typeof patch.repoIndex?.maxBytes === "number") {
    applyValue(config, "repo_index.max_bytes", patch.repoIndex.maxBytes);
  }
  if (Array.isArray(patch.repoIndex?.ignore)) {
    applyValue(config, "repo_index.ignore", patch.repoIndex.ignore);
  }

  if (typeof patch.recovery?.enabled === "boolean") {
    applyValue(config, "recovery.enabled", patch.recovery.enabled);
  }
  if (typeof patch.recovery?.maxRetryPerStep === "number") {
    applyValue(config, "recovery.max_retry_per_step", patch.recovery.maxRetryPerStep);
  }
  if (typeof patch.recovery?.dedupeWindowSteps === "number") {
    applyValue(config, "recovery.dedupe_window_steps", patch.recovery.dedupeWindowSteps);
  }
}

function toRuntimePatch(raw: Record<string, unknown>): RuntimeConfigPatch {
  const model = raw.model && typeof raw.model === "object" ? raw.model as Record<string, unknown> : {};
  const agent = raw.agent && typeof raw.agent === "object" ? raw.agent as Record<string, unknown> : {};
  const sandbox = raw.sandbox && typeof raw.sandbox === "object" ? raw.sandbox as Record<string, unknown> : {};
  const repoIndex = raw.repoIndex && typeof raw.repoIndex === "object" ? raw.repoIndex as Record<string, unknown> : {};
  const recovery = raw.recovery && typeof raw.recovery === "object" ? raw.recovery as Record<string, unknown> : {};
  const phaseLimits = agent.phaseLimits && typeof agent.phaseLimits === "object" ? agent.phaseLimits as Record<string, unknown> : {};
  const compression = agent.compression && typeof agent.compression === "object" ? agent.compression as Record<string, unknown> : {};

  return {
    model: {
      provider: model.provider === "openai" || model.provider === "anthropic" ? model.provider : undefined,
      name: typeof model.name === "string" ? model.name : undefined,
      baseUrl: typeof model.baseUrl === "string" ? model.baseUrl : undefined,
      apiKey: typeof model.apiKey === "string" ? model.apiKey : undefined
    },
    agent: {
      maxSteps: typeof agent.maxSteps === "number" ? agent.maxSteps : undefined,
      recursionLimit: typeof agent.recursionLimit === "number" ? agent.recursionLimit : undefined,
      verifyRequiredKeywords: Array.isArray(agent.verifyRequiredKeywords) ? agent.verifyRequiredKeywords as string[] : undefined,
      phaseLimits: {
        discover: typeof phaseLimits.discover === "number" ? phaseLimits.discover : undefined,
        plan: typeof phaseLimits.plan === "number" ? phaseLimits.plan : undefined,
        executeVerify: typeof phaseLimits.executeVerify === "number" ? phaseLimits.executeVerify : undefined
      },
      compression: {
        enabled: typeof compression.enabled === "boolean" ? compression.enabled : undefined,
        tokenThresholdRatio: typeof compression.tokenThresholdRatio === "number" ? compression.tokenThresholdRatio : undefined,
        retainRecentRatio: typeof compression.retainRecentRatio === "number" ? compression.retainRecentRatio : undefined,
        contextTokenBudget: typeof compression.contextTokenBudget === "number" ? compression.contextTokenBudget : undefined
      }
    },
    sandbox: {
      defaultPolicy: sandbox.defaultPolicy === "allow" || sandbox.defaultPolicy === "ask" || sandbox.defaultPolicy === "deny"
        ? sandbox.defaultPolicy
        : undefined,
      denyPatterns: Array.isArray(sandbox.denyPatterns) ? sandbox.denyPatterns as string[] : undefined,
      askPrefixes: Array.isArray(sandbox.askPrefixes) ? sandbox.askPrefixes as string[] : undefined,
      allowPrefixes: Array.isArray(sandbox.allowPrefixes) ? sandbox.allowPrefixes as string[] : undefined,
      timeoutMs: typeof sandbox.timeoutMs === "number" ? sandbox.timeoutMs : undefined,
      maxOutputBytes: typeof sandbox.maxOutputBytes === "number" ? sandbox.maxOutputBytes : undefined
    },
    repoIndex: {
      enabled: typeof repoIndex.enabled === "boolean" ? repoIndex.enabled : undefined,
      maxBytes: typeof repoIndex.maxBytes === "number" ? repoIndex.maxBytes : undefined,
      ignore: Array.isArray(repoIndex.ignore) ? repoIndex.ignore as string[] : undefined
    },
    recovery: {
      enabled: typeof recovery.enabled === "boolean" ? recovery.enabled : undefined,
      maxRetryPerStep: typeof recovery.maxRetryPerStep === "number" ? recovery.maxRetryPerStep : undefined,
      dedupeWindowSteps: typeof recovery.dedupeWindowSteps === "number" ? recovery.dedupeWindowSteps : undefined
    }
  };
}

function loadYamlConfig(configPath: string, config: ResolvedRuntimeConfig): void {
  if (!existsSync(configPath)) {
    return;
  }

  const parsed = parseSimpleYaml(readFileSync(configPath, "utf8"));
  applyPatch(config, toRuntimePatch(parsed));
}

function resolveModelEnvOverride(current: ResolvedModelConfig, env: NodeJS.ProcessEnv): Partial<ResolvedModelConfig> {
  const provider = env.MODEL_PROVIDER === "openai" || env.MODEL_PROVIDER === "anthropic"
    ? env.MODEL_PROVIDER
    : current.provider;

  const modelName = env.MODEL_NAME
    ?? (provider === "openai" ? env.OPENAI_MODEL : env.ANTHROPIC_MODEL);
  const baseUrl = env.MODEL_BASE_URL
    ?? (provider === "openai" ? env.OPENAI_BASE_URL : env.ANTHROPIC_BASE_URL);
  const apiKey = env.MODEL_API_KEY
    ?? (provider === "openai" ? env.OPENAI_API_KEY : env.ANTHROPIC_API_KEY);

  return {
    provider,
    name: modelName ?? current.name,
    baseUrl: baseUrl ?? current.baseUrl,
    apiKey: apiKey ?? current.apiKey
  };
}

function loadEnvConfig(config: ResolvedRuntimeConfig, env: NodeJS.ProcessEnv = process.env): void {
  applyPatch(config, {
    model: resolveModelEnvOverride(config.model, env)
  });

  const envMaxSteps = parsePositiveInt(env.AGENT_MAX_STEPS);
  if (envMaxSteps) {
    config.agent.maxSteps = envMaxSteps;
  }
  const envRecursion = parsePositiveInt(env.AGENT_RECURSION_LIMIT);
  if (envRecursion) {
    config.agent.recursionLimit = envRecursion;
  }
}

function loadCliOverrides(config: ResolvedRuntimeConfig, argv: string[]): void {
  const cli = parseCliOverrides(argv);
  if (cli.maxSteps) {
    config.agent.maxSteps = cli.maxSteps;
  }
  if (cli.recursionLimit) {
    config.agent.recursionLimit = cli.recursionLimit;
  }
  if (cli.sandboxPolicy) {
    config.sandbox.defaultPolicy = cli.sandboxPolicy;
  }
  if (cli.sandboxTimeoutMs) {
    config.sandbox.timeoutMs = Math.max(1000, Math.min(120000, cli.sandboxTimeoutMs));
  }
  if (cli.compressionThresholdRatio) {
    config.agent.compression.tokenThresholdRatio = cli.compressionThresholdRatio;
  }
  if (cli.verifyKeywords && cli.verifyKeywords.length > 0) {
    config.agent.verifyRequiredKeywords = cli.verifyKeywords;
  }
}

export function isModelConfigComplete(model: ResolvedModelConfig): boolean {
  return Boolean(model.provider && model.name && model.apiKey);
}

export function serializeConfigYaml(config: ResolvedRuntimeConfig): string {
  return `${stringifySimpleYaml({
    model: {
      provider: config.model.provider,
      baseUrl: config.model.baseUrl,
      name: config.model.name,
      apiKey: config.model.apiKey
    },
    agent: {
      maxSteps: config.agent.maxSteps,
      recursionLimit: config.agent.recursionLimit,
      verifyRequiredKeywords: config.agent.verifyRequiredKeywords,
      phaseLimits: {
        discover: config.agent.phaseLimits.discover,
        plan: config.agent.phaseLimits.plan,
        executeVerify: config.agent.phaseLimits.executeVerify
      },
      compression: {
        enabled: config.agent.compression.enabled,
        tokenThresholdRatio: config.agent.compression.tokenThresholdRatio,
        retainRecentRatio: config.agent.compression.retainRecentRatio,
        contextTokenBudget: config.agent.compression.contextTokenBudget
      }
    },
    sandbox: {
      defaultPolicy: config.sandbox.defaultPolicy,
      timeoutMs: config.sandbox.timeoutMs,
      maxOutputBytes: config.sandbox.maxOutputBytes,
      askPrefixes: config.sandbox.askPrefixes,
      allowPrefixes: config.sandbox.allowPrefixes,
      denyPatterns: config.sandbox.denyPatterns
    },
    repoIndex: {
      enabled: config.repoIndex.enabled,
      maxBytes: config.repoIndex.maxBytes,
      ignore: config.repoIndex.ignore
    },
    recovery: {
      enabled: config.recovery.enabled,
      maxRetryPerStep: config.recovery.maxRetryPerStep,
      dedupeWindowSteps: config.recovery.dedupeWindowSteps
    }
  })}\n`;
}

export function normalizeModelProvider(value: string | undefined, fallback: ModelProviderName = "openai"): ModelProviderName {
  return value === "anthropic" ? "anthropic" : value === "openai" ? "openai" : fallback;
}

export function loadRuntimeConfig(cwd: string, argv: string[] = process.argv.slice(2)): ResolvedRuntimeConfigResult {
  const config = cloneDefaultConfig();
  const paths = resolveNanoCodinPaths(cwd);
  const contextPaths = resolveContextFilePaths(cwd);
  const configYamlExists = existsSync(paths.configYamlPath);

  loadYamlConfig(paths.configYamlPath, config);
  loadEnvConfig(config);
  loadCliOverrides(config, argv);
  config.agentsGuidelines = parseAgentsGuidelines(contextPaths.agentsPath);

  if (config.agent.recursionLimit < config.agent.maxSteps + 2) {
    config.agent.recursionLimit = config.agent.maxSteps + 2;
  }

  return {
    config,
    sources: {
      configYamlPath: paths.configYamlPath,
      configYamlExists,
      workspaceStateDir: paths.workspaceStateDir,
      workspaceId: paths.workspaceId,
      agentsPath: contextPaths.agentsPath,
      contextPath: contextPaths.contextPath,
      memoryPath: contextPaths.memoryPath
    }
  };
}
