import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  DEFAULT_RUNTIME_CONFIG,
  type ResolvedRuntimeConfig,
  type ResolvedRuntimeConfigResult,
  type SandboxPolicyDecision
} from "../core/runtimeConfig.js";
import { loadContextSources } from "./contextLoader.js";

interface CliOverrides {
  maxSteps?: number;
  recursionLimit?: number;
  sandboxPolicy?: SandboxPolicyDecision;
  sandboxTimeoutMs?: number;
  compressionThresholdRatio?: number;
  verifyKeywords?: string[];
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

function cloneDefaultConfig(): ResolvedRuntimeConfig {
  return JSON.parse(JSON.stringify(DEFAULT_RUNTIME_CONFIG)) as ResolvedRuntimeConfig;
}

function parseTomlValue(raw: string): unknown {
  const value = raw.trim();
  if (value === "true") return true;
  if (value === "false") return false;
  if (value.startsWith("\"") && value.endsWith("\"")) return value.slice(1, -1);
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  if (value.startsWith("[") && value.endsWith("]")) {
    const body = value.slice(1, -1).trim();
    if (!body) {
      return [];
    }
    return body.split(",").map((item) => parseTomlValue(item));
  }
  const num = Number(value);
  if (Number.isFinite(num)) {
    return num;
  }
  return value;
}

export function parseFlatToml(text: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let section = "";
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    if (line.startsWith("[") && line.endsWith("]")) {
      section = line.slice(1, -1).trim();
      continue;
    }
    const eqIdx = line.indexOf("=");
    if (eqIdx <= 0) {
      continue;
    }
    const key = line.slice(0, eqIdx).trim();
    const value = parseTomlValue(line.slice(eqIdx + 1));
    const fullKey = section ? `${section}.${key}` : key;
    out[fullKey] = value;
  }
  return out;
}

export function applyValue(config: ResolvedRuntimeConfig, key: string, value: unknown): void {
  if (key === "agent.max_steps" && typeof value === "number") {
    config.agent.maxSteps = Math.max(1, Math.floor(value));
  } else if (key === "agent.recursion_limit" && typeof value === "number") {
    config.agent.recursionLimit = Math.max(2, Math.floor(value));
  } else if (key === "agent.verify_required_keywords" && Array.isArray(value)) {
    config.agent.verifyRequiredKeywords = value.filter((v): v is string => typeof v === "string" && v.length > 0);
  } else if (key === "agent.phase_limits.discover" && typeof value === "number") {
    config.agent.phaseLimits.discover = Math.max(1, Math.floor(value));
  } else if (key === "agent.phase_limits.plan" && typeof value === "number") {
    config.agent.phaseLimits.plan = Math.max(1, Math.floor(value));
  } else if (key === "agent.phase_limits.execute_verify" && typeof value === "number") {
    config.agent.phaseLimits.executeVerify = Math.max(1, Math.floor(value));
  } else if (key === "sandbox.default_policy" && (value === "allow" || value === "ask" || value === "deny")) {
    config.sandbox.defaultPolicy = value;
  } else if (key === "sandbox.deny_patterns" && Array.isArray(value)) {
    config.sandbox.denyPatterns = value.filter((v): v is string => typeof v === "string");
  } else if (key === "sandbox.ask_prefixes" && Array.isArray(value)) {
    config.sandbox.askPrefixes = value.filter((v): v is string => typeof v === "string");
  } else if (key === "sandbox.allow_prefixes" && Array.isArray(value)) {
    config.sandbox.allowPrefixes = value.filter((v): v is string => typeof v === "string");
  } else if (key === "sandbox.timeout_ms" && typeof value === "number") {
    config.sandbox.timeoutMs = Math.max(1000, Math.min(120000, Math.floor(value)));
  } else if (key === "sandbox.max_output_bytes" && typeof value === "number") {
    config.sandbox.maxOutputBytes = Math.max(1024, Math.floor(value));
  } else if (key === "repo_index.enabled" && typeof value === "boolean") {
    config.repoIndex.enabled = value;
  } else if (key === "repo_index.max_bytes" && typeof value === "number") {
    config.repoIndex.maxBytes = Math.max(100_000, Math.floor(value));
  } else if (key === "repo_index.ignore" && Array.isArray(value)) {
    config.repoIndex.ignore = value.filter((v): v is string => typeof v === "string");
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

function loadTomlConfig(configPath: string, config: ResolvedRuntimeConfig): void {
  if (!existsSync(configPath)) {
    return;
  }
  const parsed = parseFlatToml(readFileSync(configPath, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    applyValue(config, key, value);
  }
}

function loadEnvConfig(config: ResolvedRuntimeConfig): void {
  const envMaxSteps = parsePositiveInt(process.env.AGENT_MAX_STEPS);
  if (envMaxSteps) {
    config.agent.maxSteps = envMaxSteps;
  }
  const envRecursion = parsePositiveInt(process.env.AGENT_RECURSION_LIMIT);
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

export function loadRuntimeConfig(cwd: string, argv: string[] = process.argv.slice(2)): ResolvedRuntimeConfigResult {
  const config = cloneDefaultConfig();
  const configTomlPath = path.join(cwd, ".nanocodin", "config.toml");
  const context = loadContextSources(cwd);

  loadEnvConfig(config);
  loadTomlConfig(configTomlPath, config);
  loadCliOverrides(config, argv);
  config.agentsGuidelines = context.sources.projectRules;

  if (config.agent.recursionLimit < config.agent.maxSteps + 2) {
    config.agent.recursionLimit = config.agent.maxSteps + 2;
  }

  return {
    config,
    sources: {
      configTomlPath,
      agentsPath: context.paths.agentsPath,
      contextPath: context.paths.contextPath,
      memoryPath: context.paths.memoryPath
    }
  };
}
