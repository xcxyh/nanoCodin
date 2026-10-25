import { DEFAULT_RUNTIME_CONFIG, type ModelProviderName, type ResolvedModelConfig } from "../core/runtimeConfig.js";

export function defaultModelName(provider: ModelProviderName): string {
  return provider === "anthropic" ? "claude-haiku-4-5" : "gpt-4o-mini";
}
/** Identity fields never cross providers implicitly. Operational policy remains independent. */
export function applyModelPatch(current: ResolvedModelConfig, patch: Partial<ResolvedModelConfig>): ResolvedModelConfig {
  const provider = patch.provider ?? current.provider;
  const base = provider !== current.provider ? { ...current, provider, name: provider ? defaultModelName(provider) : null, baseUrl: null, apiKey: null } : current;
  return { ...base, ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) };
}
export function resolveModelConfigFromEnv(env: NodeJS.ProcessEnv = process.env, base: ResolvedModelConfig = DEFAULT_RUNTIME_CONFIG.model): ResolvedModelConfig {
  const provider = env.MODEL_PROVIDER ?? base.provider ?? "openai";
  if (provider !== "openai" && provider !== "anthropic") throw new Error("Invalid MODEL_PROVIDER: expected openai or anthropic.");
  const number = (name: string) => {
    const value = env[name]; if (value === undefined) return undefined;
    if (!/^\d+$/.test(value)) throw new Error(`Invalid ${name}: expected an integer.`);
    return Number(value);
  };
  return applyModelPatch(base, { provider,
    name: env.MODEL_NAME ?? (provider === "openai" ? env.OPENAI_MODEL : env.ANTHROPIC_MODEL),
    baseUrl: env.MODEL_BASE_URL ?? (provider === "openai" ? env.OPENAI_BASE_URL : env.ANTHROPIC_BASE_URL),
    apiKey: env.MODEL_API_KEY ?? (provider === "openai" ? env.OPENAI_API_KEY : env.ANTHROPIC_API_KEY),
    requestTimeoutMs: number("MODEL_REQUEST_TIMEOUT_MS"), idleTimeoutMs: number("MODEL_IDLE_TIMEOUT_MS"), maxRetries: number("MODEL_MAX_RETRIES")
  });
}

export function displayEndpoint(value: string | null): string {
  if (!value) return "(default)";
  try { const url = new URL(value); url.username = ""; url.password = ""; url.search = ""; return url.toString(); }
  catch { return "(invalid URL)"; }
}
