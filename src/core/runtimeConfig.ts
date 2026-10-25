export type SandboxPolicyDecision = "allow" | "ask" | "deny";
export type ModelProviderName = "openai" | "anthropic";

export interface ResolvedModelConfig {
  provider: ModelProviderName | null;
  name: string | null;
  baseUrl: string | null;
  apiKey: string | null;
  requestTimeoutMs?: number;
  idleTimeoutMs?: number;
  maxRetries?: number;
}

export interface AgentConfig {
  maxSteps: number;
  maxHistoryChars: number;
}

export interface SandboxConfig {
  defaultPolicy: SandboxPolicyDecision;
  denyPatterns: string[];
  askPrefixes: string[];
  allowPrefixes: string[];
  timeoutMs: number;
  maxOutputBytes: number;
}

export interface ResolvedRuntimeConfig {
  model: ResolvedModelConfig;
  agent: AgentConfig;
  sandbox: SandboxConfig;
}

export interface RuntimeConfigSources {
  configYamlPath: string;
  configYamlExists: boolean;
  workspaceStateDir: string;
  workspaceId: string;
  agentsPath: string;
  contextPath: string;
  memoryPath: string;
}

export interface ResolvedRuntimeConfigResult {
  config: ResolvedRuntimeConfig;
  sources: RuntimeConfigSources;
}

export const DEFAULT_MODEL_REQUEST_POLICY = { requestTimeoutMs: 600_000, idleTimeoutMs: 120_000, maxRetries: 1 };

export const DEFAULT_RUNTIME_CONFIG: ResolvedRuntimeConfig = {
  model: {
    ...DEFAULT_MODEL_REQUEST_POLICY,
    provider: "openai",
    name: "gpt-4o-mini",
    baseUrl: null,
    apiKey: null
  },
  agent: {
    maxSteps: 50,
    maxHistoryChars: 48000
  },
  sandbox: {
    defaultPolicy: "ask",
    denyPatterns: [
      "rm -rf /",
      ":(){ :|:& };:",
      "shutdown",
      "reboot",
      "mkfs",
      "dd if="
    ],
    askPrefixes: [
      "git commit",
      "git push",
      "git reset",
      "git checkout",
      "npm install",
      "npm publish",
      "pnpm install",
      "yarn install",
      "curl ",
      "wget ",
      "scp ",
      "ssh "
    ],
    allowPrefixes: [
      "ls",
      "pwd",
      "cat",
      "sed",
      "awk",
      "grep",
      "rg",
      "find",
      "tree",
      "head",
      "tail",
      "wc",
      "git status",
      "git diff",
      "git log",
      "npm test",
      "npm run test",
      "npm run lint",
      "npm run typecheck",
      "npm run build"
    ],
    timeoutMs: 60000,
    maxOutputBytes: 8192
  }
};
