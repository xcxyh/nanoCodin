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

  // 欢迎信息
  io.stdout("\n🚀 欢迎使用 nano-codin 配置向导\n");
  io.stdout("我们将引导你完成基本配置，让你快速开始使用。\n");
  io.stdout("提示：方括号中的值是默认值，直接按回车即可使用。\n\n");

  let provider: "openai" | "anthropic";
  let baseUrl: string;
  let modelName: string;
  let apiKey: string;

  try {
    // 步骤 1: 选择模型提供商
    io.stdout("📋 步骤 1/4: 选择模型提供商\n");
    provider = normalizeModelProvider(await askRequired(
      prompt,
      io,
      "  模型提供商 (openai/anthropic)",
      config.model.provider ?? "openai"
    ));
    io.stdout("");

    // 步骤 2: 配置 API 地址
    io.stdout("🌐 步骤 2/4: 配置 API 地址\n");
    baseUrl = await askRequired(prompt, io, "  API Base URL", config.model.baseUrl ?? defaultBaseUrl(provider));
    io.stdout("");

    // 步骤 3: 选择模型
    io.stdout("🤖 步骤 3/4: 选择模型\n");
    modelName = await askRequired(prompt, io, "  模型名称", config.model.name ?? undefined);
    io.stdout("");

    // 步骤 4: 配置 API Key
    io.stdout("🔑 步骤 4/4: 配置 API Key\n");
    apiKey = await askRequired(
      prompt,
      io,
      config.model.apiKey ? "  API Key (按回车保留当前值)" : "  API Key",
      config.model.apiKey ?? undefined
    );
    io.stdout("");
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

  // 保存配置
  io.stdout("💾 正在保存配置...\n");
  await mkdir(paths.homeDir, { recursive: true, mode: 0o700 });
  await writeFile(paths.configYamlPath, serializeConfigYaml(nextConfig), { encoding: "utf8", mode: 0o600 });
  await chmod(paths.configYamlPath, 0o600).catch(() => undefined);

  // 成功消息
  io.stdout(`✅ 配置已保存到: ${paths.configYamlPath}\n`);
  io.stdout("\n🎉 配置完成！你现在可以开始使用 nano-codin 了。\n");
  io.stdout("   运行 'nano-codin' 启动交互式会话。\n\n");

  return nextConfig;
}
