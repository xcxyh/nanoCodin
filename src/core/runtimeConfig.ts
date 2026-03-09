export type SandboxPolicyDecision = "allow" | "ask" | "deny";

export interface PhaseLimits {
  discover: number;
  plan: number;
  executeVerify: number;
}

export interface ContextCompressionConfig {
  enabled: boolean;
  tokenThresholdRatio: number;
  retainRecentRatio: number;
  contextTokenBudget: number;
}

export interface AgentConfig {
  maxSteps: number;
  recursionLimit: number;
  phaseLimits: PhaseLimits;
  verifyRequiredKeywords: string[];
  compression: ContextCompressionConfig;
}

export interface SandboxConfig {
  defaultPolicy: SandboxPolicyDecision;
  denyPatterns: string[];
  askPrefixes: string[];
  allowPrefixes: string[];
  timeoutMs: number;
  maxOutputBytes: number;
}

export interface RepoIndexConfig {
  enabled: boolean;
  maxBytes: number;
  ignore: string[];
  refreshMode: "mtime";
}

export interface RecoveryConfig {
  enabled: boolean;
  maxRetryPerStep: number;
  dedupeWindowSteps: number;
}

export interface ResolvedRuntimeConfig {
  agent: AgentConfig;
  sandbox: SandboxConfig;
  repoIndex: RepoIndexConfig;
  recovery: RecoveryConfig;
  agentsGuidelines: string[];
}

export interface RuntimeConfigSources {
  configTomlPath: string;
  agentsPath: string;
}

export interface ResolvedRuntimeConfigResult {
  config: ResolvedRuntimeConfig;
  sources: RuntimeConfigSources;
}

export const DEFAULT_RUNTIME_CONFIG: ResolvedRuntimeConfig = {
  agent: {
    maxSteps: 12,
    recursionLimit: 32,
    phaseLimits: {
      discover: 3,
      plan: 2,
      executeVerify: 7
    },
    verifyRequiredKeywords: ["fix", "bug", "implement", "refactor", "测试", "修复", "实现"],
    compression: {
      enabled: true,
      tokenThresholdRatio: 0.7,
      retainRecentRatio: 0.6,
      contextTokenBudget: 6000
    }
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
    timeoutMs: 15000,
    maxOutputBytes: 8192
  },
  repoIndex: {
    enabled: true,
    maxBytes: 5_000_000,
    ignore: [".git", "node_modules", "dist", ".next", "coverage"],
    refreshMode: "mtime"
  },
  recovery: {
    enabled: true,
    maxRetryPerStep: 1,
    dedupeWindowSteps: 2
  },
  agentsGuidelines: []
};

