import { chmod, mkdir, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { ResolvedRuntimeConfig } from "../core/runtimeConfig.js";
import { normalizeModelProvider, serializeConfigYaml } from "../services/configLoader.js";
import { resolveNanoCodinPaths } from "../services/userPaths.js";

export interface BootstrapIo {
  stdout(message: string): void;
  stderr(message: string): void;
  prompt?(message: string): Promise<string>;
}

function defaultBaseUrl(provider: "openai" | "anthropic"): string {
  return provider === "anthropic" ? "https://api.anthropic.com/v1" : "https://api.openai.com/v1";
}

function createPrompt(io: BootstrapIo): { ask(message: string): Promise<string>; close(): void } {
  if (io.prompt) {
    return {
      ask: async (message: string) => io.prompt!(message),
      close: () => undefined
    };
  }

  const rl = createInterface({ input, output });
  return {
    ask: async (message: string) => rl.question(message),
    close: () => rl.close()
  };
}

async function askRequired(prompt: { ask(message: string): Promise<string> }, io: BootstrapIo, question: string, fallback?: string): Promise<string> {
  while (true) {
    const suffix = fallback ? ` [${fallback}]` : "";
    const answer = (await prompt.ask(`${question}${suffix}: `)).trim();
    const value = answer || fallback || "";
    if (value.trim()) {
      return value.trim();
    }
    io.stderr("This value is required.");
  }
}

export async function runBootstrap(config: ResolvedRuntimeConfig, cwd: string, io: BootstrapIo): Promise<ResolvedRuntimeConfig> {
  const paths = resolveNanoCodinPaths(cwd);
  const prompt = createPrompt(io);
  let provider: "openai" | "anthropic";
  let baseUrl: string;
  let modelName: string;
  let apiKey: string;

  try {
    provider = normalizeModelProvider(await askRequired(
      prompt,
      io,
      "MODEL_PROVIDER (openai/anthropic)",
      config.model.provider ?? "openai"
    ));
    baseUrl = await askRequired(prompt, io, "Base URL", config.model.baseUrl ?? defaultBaseUrl(provider));
    modelName = await askRequired(prompt, io, "Model", config.model.name ?? undefined);
    apiKey = await askRequired(
      prompt,
      io,
      config.model.apiKey ? "API key (按回车保留当前值)" : "API key",
      config.model.apiKey ?? undefined
    );
  } finally {
    prompt.close();
  }

  const nextConfig: ResolvedRuntimeConfig = {
    ...config,
    model: {
      provider,
      baseUrl: baseUrl || null,
      name: modelName,
      apiKey
    }
  };

  io.stdout(`Bootstrap: writing config to ${paths.configYamlPath}`);
  await mkdir(paths.homeDir, { recursive: true, mode: 0o700 });
  await writeFile(paths.configYamlPath, serializeConfigYaml(nextConfig), { encoding: "utf8", mode: 0o600 });
  await chmod(paths.configYamlPath, 0o600).catch(() => undefined);
  return nextConfig;
}
