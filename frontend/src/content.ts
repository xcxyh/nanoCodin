export type Locale = "en" | "zh";

export type TerminalTone = "cmd" | "prompt" | "ok" | "warn" | "info" | "muted" | "answer" | "code";

export interface TerminalLine {
  tone: TerminalTone;
  prefix?: string;
  text: string;
  tag?: string;
}

export interface TerminalScenario {
  id: string;
  label: string;
  caption: string;
  footer: string;
  lines: TerminalLine[];
}

export interface ArchitectureLayer {
  id: string;
  badge: string;
  title: string;
  files: string;
  summary: string;
  details: string[];
  accent: "emerald" | "sky" | "amber";
}

export interface ExportEntry {
  subpath: string;
  role: string;
  note: string;
}

export interface EngineeringFeature {
  id: string;
  span: "wide" | "normal";
  icon: "cpu" | "layers" | "file" | "shield" | "database" | "check" | "spark";
  badge: string;
  title: string;
  body: string;
  metrics: string[];
  accent: "emerald" | "sky" | "amber";
}

export interface ComparisonRow {
  dimension: string;
  nano: string;
  heavy: string;
}

export interface CodeExample {
  id: string;
  label: string;
  filename: string;
  caption: string;
  code: string;
}

export interface ShortcutItem {
  keys: string;
  desc: string;
}

export interface CliCommandItem {
  cmd: string;
  desc: string;
}

export interface LandingCopy {
  nav: {
    architecture: string;
    engineering: string;
    cli: string;
    sdk: string;
    github: string;
  };
  hero: {
    badge: string;
    titleLine1: string;
    titleLine2: string;
    subtitle: string;
    primaryCta: string;
    secondaryCta: string;
    copy: string;
    copied: string;
    stats: { value: string; label: string }[];
  };
  scenarios: TerminalScenario[];
  architecture: {
    eyebrow: string;
    title: string;
    subtitle: string;
    sourceOfTruthTitle: string;
    sourceOfTruthBody: string;
    eventTags: string[];
    projectionsLabel: string;
    projections: string[];
    layers: ArchitectureLayer[];
    exportsTitle: string;
    exportsSubtitle: string;
    exports: ExportEntry[];
  };
  engineering: {
    eyebrow: string;
    title: string;
    subtitle: string;
    features: EngineeringFeature[];
  };
  comparison: {
    eyebrow: string;
    title: string;
    subtitle: string;
    colDimension: string;
    colNano: string;
    colHeavy: string;
    rows: ComparisonRow[];
  };
  cli: {
    eyebrow: string;
    title: string;
    subtitle: string;
    commandsTitle: string;
    commands: CliCommandItem[];
    shortcutsTitle: string;
    shortcuts: ShortcutItem[];
    exitCodesTitle: string;
    exitCodes: { code: string; label: string }[];
  };
  sdk: {
    eyebrow: string;
    title: string;
    subtitle: string;
    extensionPointsTitle: string;
    extensionPoints: { name: string; desc: string }[];
    examples: CodeExample[];
  };
  cta: {
    eyebrow: string;
    title: string;
    subtitle: string;
    primary: string;
    secondary: string;
    copied: string;
    footerNote: string;
  };
}

export const REPO_URL = "https://github.com/xcxyh/nanoCodin";
export const ARCH_DOC_URL = "https://github.com/xcxyh/nanoCodin/blob/main/docs/ARCHITECTURE.md";
export const VERSION = "v0.2.0";

export const CONTENT: Record<Locale, LandingCopy> = {
  en: {
    nav: {
      architecture: "How It Works",
      engineering: "Why It's Safe",
      cli: "Quick Start",
      sdk: "Embed SDK",
      github: "GitHub",
    },
    hero: {
      badge: `${VERSION} · TypeScript Coding Agent & Embeddable Core`,
      titleLine1: "A coding agent you can",
      titleLine2: "read, trust, and embed.",
      subtitle:
        "Nano Codin is both a ready-to-use terminal AI coder and a tiny TypeScript engine you can drop into your own app. No black-box graphs — edits are guarded, risky commands ask first, and code changes must pass tests before finishing.",
      primaryCta: "Quick Start",
      secondaryCta: "View on GitHub",
      copy: "Copy",
      copied: "Copied",
      stats: [
        { value: "~110 LOC", label: "Core loop you can read in minutes" },
        { value: "8 Tools", label: "Guarded file edits & shell runner" },
        { value: "6 Modules", label: "Import only what you need" },
        { value: "Crash-Safe", label: "Resume anytime without data loss" },
      ],
    },
    scenarios: [
      {
        id: "verify",
        label: "Test Before Finish",
        caption: "Won't let the AI finish until tests actually pass",
        footer: "model: openai · tests verified · 1.9k tokens",
        lines: [
          { tone: "cmd", prefix: "$", text: 'nano-codin "fix off-by-one bug in src/math.ts"' },
          { tone: "ok", prefix: "✓", text: "Read src/math.ts", tag: "fingerprint saved" },
          { tone: "ok", prefix: "✓", text: "Edit src/math.ts", tag: "safe replace" },
          { tone: "warn", prefix: "!", text: "Blocked finish: code changed, please run tests first" },
          { tone: "info", prefix: "?", text: "Run `npm test`? [y] once · [a] session · [n] deny", tag: "y" },
          { tone: "ok", prefix: "✓", text: "npm test passed (exit 0 · 420ms)", tag: "verified" },
          { tone: "answer", prefix: "●", text: "Fixed the boundary check in src/math.ts. All tests pass." },
        ],
      },
      {
        id: "resume",
        label: "Resume After Crash",
        caption: "Pick up where you left off without re-running old edits",
        footer: "session saved line-by-line · no duplicate writes",
        lines: [
          { tone: "cmd", prefix: "$", text: "nano-codin --resume" },
          { tone: "muted", prefix: "·", text: "Restored 14 recorded steps from the previous session" },
          { tone: "warn", prefix: "!", text: "Previous run stopped during: npm run build" },
          { tone: "muted", prefix: "·", text: "Safety rule: inspect current files first, never auto-replay writes" },
          { tone: "ok", prefix: "✓", text: "Check dist/ & run npm run typecheck", tag: "exit 0" },
          { tone: "answer", prefix: "●", text: "Workspace looks clean and typecheck passed." },
          { tone: "code", prefix: "$", text: "nano-codin --review  # inspect full history offline (0 tokens)" },
        ],
      },
      {
        id: "pr",
        label: "PR Reality Check",
        caption: "Double-checks that your PR matches your latest local commit",
        footer: "PR #48 OPEN · local commit matches remote PR",
        lines: [
          { tone: "cmd", prefix: "$", text: 'nano-codin "commit this fix and open a PR"' },
          { tone: "ok", prefix: "✓", text: "gh pr create --fill", tag: "PR #48" },
          { tone: "warn", prefix: "!", text: "Check required: verify remote PR commit matches local HEAD" },
          { tone: "ok", prefix: "✓", text: "git rev-parse HEAD", tag: "4c8e91a…f02" },
          { tone: "ok", prefix: "✓", text: "gh pr view 48 --json state,headRefOid", tag: "OPEN" },
          { tone: "answer", prefix: "●", text: "PR #48 is OPEN and synced with your latest commit." },
        ],
      },
    ],
    architecture: {
      eyebrow: "How It Works",
      title: "One simple loop. One shared timeline.",
      subtitle:
        "Most agent frameworks hide state inside tangled graphs. Nano Codin keeps it simple: one plain loop appends every step to a single timeline, and everything else reads from it.",
      sourceOfTruthTitle: "One Shared Timeline (Session.events[])",
      sourceOfTruthBody:
        "Every prompt, tool call, error, and result is appended in order. The terminal UI, AI context window, test checker, and offline review all read from this same log — so nothing ever gets out of sync.",
      eventTags: ["user", "model_start", "model_end", "usage", "tool_start", "tool_end", "notice", "finish"],
      projectionsLabel: "Everything derives from it",
      projections: [
        "AI Prompt Context",
        "Terminal UI View",
        "Test Verification Check",
        "Offline Audit (--review)",
      ],
      layers: [
        {
          id: "core",
          badge: "Step 1 · Core Loop",
          title: "Run the loop & track every step",
          files: "src/agent/run.ts · session.ts · history.ts",
          summary:
            "A ~110-line async loop: ask the model, run tools, feed results back, repeat. It has zero dependency on the terminal UI, AI SDKs, or shell tools.",
          details: [
            "Swap out the model, tools, prompt rules, approval UI, or storage via clean callbacks",
            "Automatically trims long histories to a 48k budget while keeping unresolved errors pinned",
            "UI bugs or slow loggers are isolated so they can never crash an active run",
          ],
          accent: "emerald",
        },
        {
          id: "model",
          badge: "Step 2 · Model Connection",
          title: "Talk to any LLM without hanging",
          files: "src/model/request.ts · protocol.ts · provider.ts",
          summary:
            "Works with OpenAI, Anthropic, DeepSeek, or custom endpoints. We turn off hidden SDK retries so Nano Codin stays in full control of timeouts and cancellation.",
          details: [
            "Separate total timeout (10m) and idle-stall timeout (2m) catch frozen streams fast",
            "Auto-falls back to a simple text protocol if an endpoint doesn't support native tool calling",
            "Automatically hides API keys & Bearer tokens before showing any network error",
          ],
          accent: "sky",
        },
        {
          id: "tools",
          badge: "Step 3 · Files & Shell",
          title: "Safe edits & supervised commands",
          files: "src/tools/fileIO.ts · files.ts · shell.ts · process.ts",
          summary:
            "8 focused tools for browsing, editing, and running commands — engineered to prevent accidental overwrites, sneaky shell chains, and leftover background processes.",
          details: [
            "Edits require exact matches or a SHA-256 check, then swap files atomically via rename()",
            "A real command parser catches chained tricks like `ls && rm -rf` so they always ask first",
            "Pressing Esc or hitting a timeout kills the entire child process tree cleanly",
          ],
          accent: "amber",
        },
        {
          id: "coding",
          badge: "Step 4 · Quality & Saving",
          title: "Verify results & save as you go",
          files: "src/coding/verification.ts · pullRequest.ts · src/session/journal.ts",
          summary:
            "Built-in quality rules make sure changes are actually tested, while line-by-line session logs keep your work safe across crashes.",
          details: [
            "Any file edit resets test status — the AI must run a clean check before it can finish",
            "For PR tasks, checks that the GitHub PR is OPEN and matches your local HEAD commit",
            "Each run writes to its own numbered log file with PID locking to prevent multi-tab clashes",
          ],
          accent: "emerald",
        },
      ],
      exportsTitle: "Use the whole CLI, or import just one piece",
      exportsSubtitle:
        "The package splits cleanly into 6 modules — importing the core never pulls in React, Ink, or model SDKs.",
      exports: [
        { subpath: "nano-codin", role: "Core Engine", note: "The async agent loop, defineTool, and verification helper" },
        { subpath: "nano-codin/models", role: "LLM Clients", note: "OpenAI & Anthropic adapters with smart timeouts & fallback" },
        { subpath: "nano-codin/tools", role: "8 Built-in Tools", note: "ls, grep, view, create, str_replace, bash, todo, ask" },
        { subpath: "nano-codin/session", role: "Session Logs", note: "Crash-safe file storage for --resume and --review" },
        { subpath: "nano-codin/context", role: "Rules & Skills", note: "Loads AGENTS.md guidelines and on-demand skills" },
        { subpath: "nano-codin/templates", role: "Prompt Templates", note: "Optional Handlebars templates with hot reload" },
      ],
    },
    engineering: {
      eyebrow: "Why It's Reliable",
      title: "Fixes the 6 ways AI coding agents usually go wrong.",
      subtitle:
        "Plain-English safeguards backed by real systems engineering — no fragile prompt-only wishes.",
      features: [
        {
          id: "verify",
          span: "wide",
          icon: "check",
          badge: "No Fake Finishes",
          title: "Code changes must pass a real test before finishing",
          body: "AI assistants love to say 'Fixed!' without running tests — or tweak one more line right after tests pass. Nano Codin tracks every edit: whenever a file changes, prior test results expire, and the finish gate blocks completion until a clean check passes. For PR tasks, it also verifies the remote PR matches your exact local commit.",
          metrics: ["beforeFinish Gate", "Edit-Resets-Checks", "PR Commit Match"],
          accent: "emerald",
        },
        {
          id: "gateway",
          span: "wide",
          icon: "cpu",
          badge: "Never Hangs",
          title: "Smart timeouts, auto-fallback & secret redaction",
          body: "Long reasoning takes time, but a dead network socket shouldn't freeze your terminal for 10 minutes. We track total time and idle stream time separately, cut off runaway >8 MiB responses, fall back to text tool-calling on basic endpoints, keep DeepSeek reasoning chains intact, and strip API keys from error logs.",
          metrics: ["Total + Idle Timeout", "Auto Text Fallback", "Secret Redaction"],
          accent: "sky",
        },
        {
          id: "fileio",
          span: "normal",
          icon: "file",
          badge: "Safe File Edits",
          title: "Guardrails against silent overwrites or half-written files",
          body: "Creating a file never overwrites an existing one. Editing requires an exact unique match — or a full rewrite verified by the file's SHA-256 fingerprint. We reject symlinks, hard links, and binary files, write to a temp file first, preserve permissions, and swap atomically.",
          metrics: ["No Overwrite (wx)", "SHA-256 Check", "Atomic rename()"],
          accent: "amber",
        },
        {
          id: "shell",
          span: "normal",
          icon: "shield",
          badge: "Supervised Shell",
          title: "Catches sneaky command chains & leaves zero zombie processes",
          body: "Simple prefix checks are easy to bypass with `ls && rm -rf`. Our tokenizer spots chained commands and asks for approval (once, session, or deny). Hit Esc or time out, and the entire child process group is cleaned up across macOS, Linux, and Windows.",
          metrics: ["Command Parser", "3-Tier Approval", "Process-Tree Kill"],
          accent: "amber",
        },
        {
          id: "context",
          span: "normal",
          icon: "layers",
          badge: "Sharp Memory",
          title: "Long sessions stay focused without lossy AI summaries",
          body: "Asking an LLM to summarize old logs often drops exact line numbers and stack traces. Instead, we keep a deterministic 48k-char window that pins unresolved errors, recent edits, and your original task — while saving 100% of raw history on disk.",
          metrics: ["48k Budget", "Error & Edit Pinning", "Full History Saved"],
          accent: "emerald",
        },
        {
          id: "wal",
          span: "normal",
          icon: "database",
          badge: "Crash-Safe",
          title: "Resume after a crash without repeating risky edits",
          body: "Every event is appended line-by-line to a numbered journal file, so a sudden crash never corrupts earlier history. Multi-window locks prevent two terminals from colliding, and `--resume` warns the AI to check disk state instead of blindly re-running interrupted writes.",
          metrics: ["WAL Journal Logs", "Multi-Window PID Lock", "No Auto-Replay"],
          accent: "sky",
        },
      ],
    },
    comparison: {
      eyebrow: "At a Glance",
      title: "Clear and lightweight vs. heavy agent frameworks",
      subtitle: "Built for developers who want to understand and control what their coding agent actually does.",
      colDimension: "What matters",
      colNano: "Nano Codin",
      colHeavy: "Heavy Graph Frameworks",
      rows: [
        {
          dimension: "Easy to understand",
          nano: "~110-line linear loop — read the whole core over coffee",
          heavy: "Tangled node graphs, routers, and hidden state reducers",
        },
        {
          dimension: "Timeouts & cancel",
          nano: "Full control over total/idle timeouts and instant Esc cancel",
          heavy: "Nested SDK retries cause opaque hangs and leaked requests",
        },
        {
          dimension: "Long conversations",
          nano: "Pins real errors & edits deterministically; zero summary drift",
          heavy: "AI summaries often lose exact file paths and error lines",
        },
        {
          dimension: "Crash recovery",
          nano: "Append-only journals + PID lock + never replays half-done writes",
          heavy: "Overwriting one big JSON risks corruption on sudden exit",
        },
        {
          dimension: "Embedding in apps",
          nano: "Tiny core package; terminal UI loads only when running in a TTY",
          heavy: "Heavy all-in-one bundle tightly coupled to CLI or database",
        },
      ],
    },
    cli: {
      eyebrow: "Quick Start · Terminal CLI",
      title: "Up and running in 30 seconds.",
      subtitle:
        "Install globally and run in any project. First run guides your API key setup. Pipe input or use --print for CI scripts.",
      commandsTitle: "Common Commands",
      commands: [
        { cmd: "npm install -g nano-codin", desc: "Install the CLI globally (requires Node.js 20.5+)" },
        { cmd: "nano-codin", desc: "Start the interactive terminal UI (guided setup on first run)" },
        { cmd: 'nano-codin --print --prompt "review src/index.ts"', desc: "Run once without UI — ideal for scripts & CI pipelines" },
        { cmd: "nano-codin --resume", desc: "Continue your last session safely without replaying old writes" },
        { cmd: "nano-codin --review", desc: "Read a local summary of edits, checks & tokens (no LLM call)" },
      ],
      shortcutsTitle: "Keyboard Shortcuts",
      shortcuts: [
        { keys: "@", desc: "Search and attach project files directly in your prompt" },
        { keys: "/", desc: "Run commands (/clear, /quit) or trigger project skills" },
        { keys: "Ctrl + O", desc: "Open collapsed tool logs — use ↑↓ to pick, ←→ to flip pages" },
        { keys: "Esc", desc: "Close menus, or immediately stop the active run & shell command" },
        { keys: "Ctrl + C × 2", desc: "Cancel while running, or press twice while idle to exit" },
      ],
      exitCodesTitle: "Script-Friendly Exit Codes",
      exitCodes: [
        { code: "0", label: "Completed" },
        { code: "1", label: "Error" },
        { code: "2", label: "Stopped / Incomplete" },
        { code: "130", label: "Cancelled by user" },
      ],
    },
    sdk: {
      eyebrow: "For Builders · Embeddable SDK",
      title: "Need an agent inside your own app? Import the core.",
      subtitle:
        "Bring your own model, Zod-validated tools, prompt templates, and approval UI. No Ink or shell tools bundled in the core.",
      extensionPointsTitle: "7 Clean Hooks to Customize",
      extensionPoints: [
        { name: "model", desc: "Use OpenAI, Anthropic, or write your own generate() function" },
        { name: "tools / defineTool", desc: "One Zod schema gives you TypeScript types + runtime checks" },
        { name: "instructions", desc: "Pass a string or build dynamic prompts before every run" },
        { name: "beforeFinish(session)", desc: "Block completion if tests or custom rules aren't satisfied" },
        { name: "ask(request, signal)", desc: "Connect your own terminal prompt, web dialog, or Slack bot" },
        { name: "save(session)", desc: "Store sessions in files, Postgres, Redis, or anywhere you like" },
        { name: "onEvent / onProgress", desc: "Stream live tool output and structured events to your UI" },
      ],
      examples: [
        {
          id: "minimal",
          label: "Minimal Agent",
          filename: "agent.ts",
          caption: "20 lines to embed — no terminal UI, no shell, no config files",
          code: `import { z } from "zod";
import { createAgent, defineTool } from "nano-codin";
import { createModelProvider } from "nano-codin/models";

const queryMetrics = defineTool({
  name: "query_metrics",
  description: "Fetch p95 latency for a service",
  schema: z.object({ service: z.string().min(1) }),
  async execute({ service }) {
    return { ok: true, output: \`\${service}: p95=42ms\` };
  },
});

const agent = createAgent({
  model: createModelProvider({
    provider: "openai",
    name: "gpt-4.1",
    apiKey: process.env.MODEL_API_KEY!,
    baseUrl: null,
  }),
  tools: [queryMetrics],
  instructions: "Check service latency and answer concisely.",
});

const result = await agent.run("Inspect checkout-api latency");
console.log(result.status, result.answer);`,
        },
        {
          id: "hooks",
          label: "Verify & Stream",
          filename: "verified-run.ts",
          caption: "Add test verification, custom approval UI, and live output streaming",
          code: `import { createAgent, requireVerification } from "nano-codin";
import { createDefaultTools } from "nano-codin/tools";
import { FileSessionStore } from "nano-codin/session";

const store = new FileSessionStore(process.cwd());
const controller = new AbortController();

const agent = createAgent({
  model,
  tools: createDefaultTools({ defaultPolicy: "ask", timeoutMs: 60_000 }),
  beforeFinish: requireVerification,
  ask: async (req) => promptUserInYourUi(req),
  save: (session) => store.save(session),
});

const res = await agent.run("Refactor auth middleware", {
  signal: controller.signal,
  onEvent: (ev) => console.log(ev.type),
  onProgress: (chunk) => streamTailToUi(chunk.stream, chunk.text),
});`,
        },
        {
          id: "templates",
          label: "Prompts & Skills",
          filename: "prompt-context.ts",
          caption: "Load project AGENTS.md rules, on-demand skills & live Handlebars prompts",
          code: `import { createAgent } from "nano-codin";
import { loadProjectContext } from "nano-codin/context";
import { createTemplateInstructions } from "nano-codin/templates";

// Plaintext Handlebars (noEscape: true) — edits apply on next run
const instructions = createTemplateInstructions({
  file: "./.nanocodin/prompts/system.hbs",
  data: (task, session) => loadProjectContext(process.cwd(), task, session),
});

const agent = createAgent({
  model,
  tools,
  instructions, // injects projectRules, availableSkills & selectedSkills
});`,
        },
      ],
    },
    cta: {
      eyebrow: "Open Source · GPL-3.0",
      title: "Read the whole core in one sitting.",
      subtitle:
        "Star the repo, browse the architecture guide, or try examples/custom-agent.ts locally — no API key needed.",
      primary: "Star on GitHub",
      secondary: "Copy install command",
      copied: "Copied: npm install -g nano-codin",
      footerNote: "Nano Codin · Built with TypeScript, ESM, Zod & Ink · GPL-3.0 License",
    },
  },
  zh: {
    nav: {
      architecture: "工作原理",
      engineering: "为什么靠谱",
      cli: "快速上手",
      sdk: "嵌入项目",
      github: "GitHub",
    },
    hero: {
      badge: `${VERSION} · 看得懂的 TypeScript AI 编程助手与核心引擎`,
      titleLine1: "看得懂的 AI 编程助手，",
      titleLine2: "改得动的核心引擎。",
      subtitle:
        "Nano Codin 既是一个开箱即用的终端 AI 编程工具，也是一个能直接嵌进自己项目的轻量 TypeScript 核心。没有复杂的黑盒流程——改文件防误覆盖、危险命令先询问、改完代码必须跑过测试才算完成。",
      primaryCta: "30 秒快速上手",
      secondaryCta: "查看 GitHub 源码",
      copy: "复制",
      copied: "已复制",
      stats: [
        { value: "~110 行", label: "核心循环，几分钟就能读懂" },
        { value: "8 个工具", label: "安全读写文件 + 受控终端命令" },
        { value: "6 个模块", label: "按需引入，不绑死终端界面" },
        { value: "随时续接", label: "中断崩溃也不丢历史进度" },
      ],
    },
    scenarios: [
      {
        id: "verify",
        label: "改完必须跑测试",
        caption: "没跑过测试，系统不会让 AI 提前交差",
        footer: "model: openai · 已通过测试验收 · 1.9k tokens",
        lines: [
          { tone: "cmd", prefix: "$", text: 'nano-codin "修复 src/math.ts 的边界 bug"' },
          { tone: "ok", prefix: "✓", text: "读取 src/math.ts", tag: "已记录文件指纹" },
          { tone: "ok", prefix: "✓", text: "精确修改 src/math.ts", tag: "安全原子替换" },
          { tone: "warn", prefix: "!", text: "验收拦截：代码已改动，请先跑通测试再结束" },
          { tone: "info", prefix: "?", text: "运行 `npm test`？[y] 本次 · [a] 会话 · [n] 拒绝", tag: "y" },
          { tone: "ok", prefix: "✓", text: "npm test 通过 (exit 0 · 420ms)", tag: "验收通过" },
          { tone: "answer", prefix: "●", text: "已修复 src/math.ts 边界问题，测试全部通过。" },
        ],
      },
      {
        id: "resume",
        label: "崩了随时续接",
        caption: "断点恢复进度，且绝不盲目重复写文件",
        footer: "每步实时追加存档 · 禁止自动重放写操作",
        lines: [
          { tone: "cmd", prefix: "$", text: "nano-codin --resume" },
          { tone: "muted", prefix: "·", text: "已恢复上次会话的 14 条执行记录" },
          { tone: "warn", prefix: "!", text: "发现上次中途停止的操作：npm run build" },
          { tone: "muted", prefix: "·", text: "安全规则：先检查当前文件状态，不自动重跑旧改动" },
          { tone: "ok", prefix: "✓", text: "检查 dist/ 并执行 npm run typecheck", tag: "exit 0" },
          { tone: "answer", prefix: "●", text: "工作区状态正常，类型检查已通过。" },
          { tone: "code", prefix: "$", text: "nano-codin --review  # 离线查看修改与耗时，不花 Token" },
        ],
      },
      {
        id: "pr",
        label: "PR 真实性核对",
        caption: "自动核对远端 PR 和本地最新提交完全一致",
        footer: "PR #48 状态 OPEN · 本地与远端提交号一致",
        lines: [
          { tone: "cmd", prefix: "$", text: 'nano-codin "提交这次修复并提一个 PR"' },
          { tone: "ok", prefix: "✓", text: "gh pr create --fill", tag: "PR #48" },
          { tone: "warn", prefix: "!", text: "交付核对：请确认远端 PR 与本地最新提交一致" },
          { tone: "ok", prefix: "✓", text: "git rev-parse HEAD", tag: "4c8e91a…f02" },
          { tone: "ok", prefix: "✓", text: "gh pr view 48 --json state,headRefOid", tag: "OPEN" },
          { tone: "answer", prefix: "●", text: "PR #48 已打开，且已同步到最新本地提交。" },
        ],
      },
    ],
    architecture: {
      eyebrow: "工作原理",
      title: "一个简单循环 + 一份统一流水账。",
      subtitle:
        "很多 Agent 框架把状态藏在复杂的流程图里，出了问题无从下手。Nano Codin 反过来做减法：把每一步发生的事按顺序记在一份记录里，界面、上下文、测试验收全从这里算出来。",
      sourceOfTruthTitle: "所有信息，只认这一份记录（Session.events[]）",
      sourceOfTruthBody:
        "从你提需求、AI 调工具、报错、修改文件到最终答复，全部按时间顺序追加保存。因为只有这一份数据源，所以界面显示、发给 AI 的记忆和本地存档永远不会互相打架。",
      eventTags: ["user", "model_start", "model_end", "usage", "tool_start", "tool_end", "notice", "finish"],
      projectionsLabel: "所有视图都从这里算出来",
      projections: [
        "发给 AI 的对话记忆",
        "终端实时界面",
        "改后测试验收",
        "离线复盘报告 (--review)",
      ],
      layers: [
        {
          id: "core",
          badge: "第 1 层 · 核心循环",
          title: "驱动「思考 → 调工具 → 看结果」",
          files: "src/agent/run.ts · session.ts · history.ts",
          summary:
            "整个核心引擎只有约 110 行代码：发消息给 AI、执行工具、把结果交回 AI，循环直到完成。它不绑定任何界面或模型厂商。",
          details: [
            "模型、工具、提示词、确认弹窗、存储方式全都可以按需替换",
            "自动控制发给 AI 的历史长度，优先保留还没修好的报错和刚改过的文件",
            "界面渲染或日志回调即使出错也会被隔离，绝不会搞崩主任务",
          ],
          accent: "emerald",
        },
        {
          id: "model",
          badge: "第 2 层 · 模型连接",
          title: "连得上各种模型，且不怕网络卡死",
          files: "src/model/request.ts · protocol.ts · provider.ts",
          summary:
            "支持 OpenAI、Anthropic、DeepSeek 和各类兼容中转接口。我们关掉了 SDK 隐藏的自动重试，把超时和取消控制权牢牢掌握在自己手里。",
          details: [
            "把「总耗时」和「卡住没响应」分开计时，既不误杀慢思考，也不在断网时干等",
            "如果接口不支持原生工具调用（Function Calling），自动切到纯文本协议继续干活",
            "报错信息输出前自动抹掉 API Key 和 Bearer 令牌，防止密钥意外泄漏",
          ],
          accent: "sky",
        },
        {
          id: "tools",
          badge: "第 3 层 · 文件与命令",
          title: "改代码防手抖，跑命令听你指挥",
          files: "src/tools/fileIO.ts · files.ts · shell.ts · process.ts",
          summary:
            "内置 8 个常用开发工具，核心目标只有一个：让 AI 能干活，但绝不能悄悄毁掉你的代码或在后台留下关不掉的进程。",
          details: [
            "新建文件绝不覆盖旧文件；改文件需精确匹配或核对 SHA-256 指纹，最后原子替换",
            "自带命令解析器，能识破 `ls && rm -rf` 这类拼接命令，敏感操作必须弹窗确认",
            "按 Esc 取消或命令超时时，会自动清理整棵子进程树，不留后台僵尸进程",
          ],
          accent: "amber",
        },
        {
          id: "coding",
          badge: "第 4 层 · 验收与存档",
          title: "帮你守住质量底线，每一步实时存盘",
          files: "src/coding/verification.ts · pullRequest.ts · src/session/journal.ts",
          summary:
            "把「改完要跑测试」和「崩溃能恢复」做成开箱即用的能力，同时保持可插拔，不需要时也能轻松替换。",
          details: [
            "只要改动过代码，旧的测试通过记录立刻作废，AI 必须重新跑通验证才能结束",
            "做提 PR 任务时，自动检查远端 PR 是否打开、且提交号与本地最新代码完全一致",
            "每次运行按行追加到独立日志文件，带多窗口进程锁，断电崩溃也不怕文件损坏",
          ],
          accent: "emerald",
        },
      ],
      exportsTitle: "既能当工具直接用，也能拆开挑着引入",
      exportsSubtitle: "包内清晰拆分为 6 个入口：只引核心引擎时，完全不会拖入 React、终端界面或模型 SDK。",
      exports: [
        { subpath: "nano-codin", role: "核心引擎", note: "极简执行循环、自定义工具定义与验收能力" },
        { subpath: "nano-codin/models", role: "模型适配", note: "OpenAI / Anthropic 接入、双超时与自动降级" },
        { subpath: "nano-codin/tools", role: "8 个内置工具", note: "列目录、搜索、读/建/改文件、Shell、待办与提问" },
        { subpath: "nano-codin/session", role: "安全存档", note: "支持崩溃恢复（--resume）和离线复盘（--review）" },
        { subpath: "nano-codin/context", role: "规范与技能", note: "自动读取项目 AGENTS.md 规范与按需加载 Skills" },
        { subpath: "nano-codin/templates", role: "提示词模板", note: "可选 Handlebars 模板，改完文件下一轮直接生效" },
      ],
    },
    engineering: {
      eyebrow: "为什么靠谱",
      title: "专治 AI 编程工具最常见的 6 个翻车瞬间。",
      subtitle: "不靠玄学提示词祈祷，用实打实的工程机制把每一步风险兜住。",
      features: [
        {
          id: "verify",
          span: "wide",
          icon: "check",
          badge: "拒绝嘴上说修好了",
          title: "改完代码必须跑过测试，否则不让结束",
          body: "AI 经常改完代码就直接说「搞定了」，甚至跑完测试又顺手改了一行引入新 Bug。Nano Codin 会盯紧每一次文件改动：只要代码变了，之前的测试记录立刻作废，系统会拦住 AI 要求它重新跑通测试才能交差；提 PR 时还会自动核对远端和本地提交号完全一致。",
          metrics: ["改后强制验收", "beforeFinish 钩子", "PR 提交号核对"],
          accent: "emerald",
        },
        {
          id: "gateway",
          span: "wide",
          icon: "cpu",
          badge: "不怕卡死和兼容坑",
          title: "网络假死能及时止损，小众接口自动兼容",
          body: "复杂思考需要几分钟，但如果网络半路卡死，总不能一直干等。我们把「总耗时上限」和「长时间没动静」分开计时，超时立刻断开；遇到不支持原生工具调用的模型接口，会自动切回文本模式继续工作，并且所有报错日志都会自动隐藏你的 API Key。",
          metrics: ["总超时 + 空闲超时", "自动文本降级", "密钥自动脱敏"],
          accent: "sky",
        },
        {
          id: "fileio",
          span: "normal",
          icon: "file",
          badge: "改文件有安全锁",
          title: "不会误覆盖已有文件，也不会把代码写残",
          body: "新建文件遇到同名直接拒绝，绝不悄悄覆盖。修改代码要求唯一精确匹配；整文件重写必须先核对最新的内容指纹（SHA-256）。写入时会先写临时文件、保留原权限再一次性替换，中途断电也不会清空源文件。",
          metrics: ["新建防覆盖", "SHA-256 指纹校验", "原子替换"],
          accent: "amber",
        },
        {
          id: "shell",
          span: "normal",
          icon: "shield",
          badge: "命令可控、一停全停",
          title: "识破拼接危险命令，按 Esc 彻底清理子进程",
          body: "只看命令开头很容易被 `ls && rm -rf` 绕过。内置词法解析器能识别拼接与管道，敏感操作弹窗等你拍板（本次 / 会话 / 拒绝）。按 Esc 取消或超时时，会连带杀掉整个子进程树，绝不在后台残留僵尸进程。",
          metrics: ["防命令拼接绕过", "三档审批", "子进程树清理"],
          accent: "amber",
        },
        {
          id: "context",
          span: "normal",
          icon: "layers",
          badge: "聊久了也不失忆",
          title: "自动钉住关键报错和改动，省 Token 还不丢行号",
          body: "让 AI 总结历史对话很容易把具体行号和报错堆栈概括丢。我们改为在 48k 字符预算内精准筛选：优先把还没解决的报错、刚改的文件和最初目标钉在上下文里，既省费用又不跑偏，完整记录则 100% 留在硬盘上。",
          metrics: ["48k 精准预算", "关键报错固定", "完整历史留存"],
          accent: "emerald",
        },
        {
          id: "wal",
          span: "normal",
          icon: "database",
          badge: "崩溃可安全恢复",
          title: "每步实时追加存档，续接绝不重复乱改",
          body: "每次运行都会按行追加写入独立的编号日志文件，哪怕突然断电也最多丢最后半行，不影响前面记录。同时自带多窗口冲突检测，用 `--resume` 续接时会提醒 AI 先检查现状，绝不会把中断的写操作盲目重跑一遍。",
          metrics: ["WAL 分段日志", "多窗口 PID 锁", "中断防重放"],
          accent: "sky",
        },
      ],
    },
    comparison: {
      eyebrow: "一眼看懂区别",
      title: "轻装上阵 vs 重型 Agent 框架",
      subtitle: "把复杂留给可靠性，把简单留给开发者。",
      colDimension: "你关心的问题",
      colNano: "Nano Codin",
      colHeavy: "传统重型图编排框架",
      rows: [
        {
          dimension: "代码好不好懂？",
          nano: "核心循环约 110 行，喝杯咖啡就能通读改造",
          heavy: "层层抽象的图节点和路由器，出问题像开盲盒",
        },
        {
          dimension: "卡死/取消好不好控？",
          nano: "统一管控总超时与空闲超时，按 Esc 立刻停干净",
          heavy: "框架与底层 SDK 互相重试，经常假死或关不掉",
        },
        {
          dimension: "聊久了会不会忘细节？",
          nano: "精准钉住原始报错和修改记录，不丢行号与堆栈",
          heavy: "靠 AI 做摘要压缩，聊几轮就忘了具体报错位置",
        },
        {
          dimension: "中途崩了怎么办？",
          nano: "按行追加存档 + 防多窗口冲突 + 续接不重复写入",
          heavy: "每次全量覆盖大 JSON，写一半崩溃容易整份损坏",
        },
        {
          dimension: "想嵌进自己项目重不重？",
          nano: "核心零重依赖，终端界面只在交互模式按需加载",
          heavy: "全家桶强耦合，为了用一个循环拖进一整套大依赖",
        },
      ],
    },
    cli: {
      eyebrow: "快速上手 · 终端 CLI",
      title: "30 秒跑起来，顺手好用。",
      subtitle:
        "全局安装后在任意项目目录直接启动；首次运行会一步步引导配置 API Key。配合 --print 也能直接塞进 CI 脚本里。",
      commandsTitle: "最常用的 5 条命令",
      commands: [
        { cmd: "npm install -g nano-codin", desc: "全局安装（需要 Node.js 20.5 及以上）" },
        { cmd: "nano-codin", desc: "启动终端交互界面，首次运行自动引导填入 API Key" },
        { cmd: 'nano-codin --print --prompt "审查 src/index.ts"', desc: "无界面单次运行并输出结果，适合脚本和 CI" },
        { cmd: "nano-codin --resume", desc: "接着上次的会话继续做，不会重复执行旧修改" },
        { cmd: "nano-codin --review", desc: "离线查看上次改了哪些文件、跑了什么测试（0 Token）" },
      ],
      shortcutsTitle: "终端里超顺手的快捷键",
      shortcuts: [
        { keys: "@", desc: "快速搜索并选中项目里的文件，直接带入提问" },
        { keys: "/", desc: "触发内置命令（/clear、/quit）或项目里的 Skills" },
        { keys: "Ctrl + O", desc: "展开折叠的执行过程，↑↓ 选步骤，←→ 翻页看详情" },
        { keys: "Esc", desc: "关闭弹窗，或立刻中止正在跑的模型请求与终端命令" },
        { keys: "Ctrl + C × 2", desc: "运行时按一次取消任务，空闲时连按两次退出" },
      ],
      exitCodesTitle: "清晰标准的退出码（方便写脚本）",
      exitCodes: [
        { code: "0", label: "顺利完成" },
        { code: "1", label: "执行报错" },
        { code: "2", label: "未完成 / 达到轮次上限" },
        { code: "130", label: "用户手动取消" },
      ],
    },
    sdk: {
      eyebrow: "进阶玩法 · 嵌入你的程序",
      title: "想把同款能力嵌进自己的系统？直接引 SDK。",
      subtitle:
        "自由传入你自己的模型、Zod 强类型工具、提示词模板和审批界面。引入核心包完全不带终端 UI 和多余依赖。",
      extensionPointsTitle: "7 个开箱即用的定制入口",
      extensionPoints: [
        { name: "model", desc: "用内置 OpenAI/Anthropic，或自己写个函数接入任意模型" },
        { name: "tools / defineTool", desc: "写一份 Zod 规则，自动同时获得 TS 类型提示和参数校验" },
        { name: "instructions", desc: "传固定字符串，或每次运行前动态拼装提示词" },
        { name: "beforeFinish(session)", desc: "自定义完成条件：不满足就让 AI 继续，满足就放行" },
        { name: "ask(request, signal)", desc: "自由对接终端、网页弹窗、飞书/Slack 审批或自动放行" },
        { name: "save(session)", desc: "想存本地文件、数据库还是 Redis，一个回调搞定" },
        { name: "onEvent / onProgress", desc: "实时监听每个步骤和命令输出流，轻松对接你的界面" },
      ],
      examples: [
        {
          id: "minimal",
          label: "20 行最小接入",
          filename: "agent.ts",
          caption: "只用核心引擎 —— 不加载终端 UI、不加载 Shell、零配置文件",
          code: `import { z } from "zod";
import { createAgent, defineTool } from "nano-codin";
import { createModelProvider } from "nano-codin/models";

const queryMetrics = defineTool({
  name: "query_metrics",
  description: "查询指定服务的 p95 延迟",
  schema: z.object({ service: z.string().min(1) }),
  async execute({ service }) {
    return { ok: true, output: \`\${service}: p95=42ms\` };
  },
});

const agent = createAgent({
  model: createModelProvider({
    provider: "openai",
    name: "gpt-4.1",
    apiKey: process.env.MODEL_API_KEY!,
    baseUrl: null,
  }),
  tools: [queryMetrics],
  instructions: "查询服务延迟并给出简明结论。",
});

const result = await agent.run("检查 checkout-api 的延迟");
console.log(result.status, result.answer);`,
        },
        {
          id: "hooks",
          label: "加上验收与流式监听",
          filename: "verified-run.ts",
          caption: "挂载改后测试验收、自定义审批界面和实时日志输出",
          code: `import { createAgent, requireVerification } from "nano-codin";
import { createDefaultTools } from "nano-codin/tools";
import { FileSessionStore } from "nano-codin/session";

const store = new FileSessionStore(process.cwd());
const controller = new AbortController();

const agent = createAgent({
  model,
  tools: createDefaultTools({ defaultPolicy: "ask", timeoutMs: 60_000 }),
  beforeFinish: requireVerification,
  ask: async (req) => promptUserInYourUi(req),
  save: (session) => store.save(session),
});

const res = await agent.run("重构鉴权中间件并确保测试通过", {
  signal: controller.signal,
  onEvent: (ev) => console.log(ev.type),
  onProgress: (chunk) => streamTailToUi(chunk.stream, chunk.text),
});`,
        },
        {
          id: "templates",
          label: "项目规范与模板",
          filename: "prompt-context.ts",
          caption: "读取项目 AGENTS.md、按需触发 Skills，提示词改完即时生效",
          code: `import { createAgent } from "nano-codin";
import { loadProjectContext } from "nano-codin/context";
import { createTemplateInstructions } from "nano-codin/templates";

// 纯文本模式（noEscape: true），修改模板文件在下一轮直接生效
const instructions = createTemplateInstructions({
  file: "./.nanocodin/prompts/system.hbs",
  data: (task, session) => loadProjectContext(process.cwd(), task, session),
});

const agent = createAgent({
  model,
  tools,
  instructions, // 自动注入 projectRules、availableSkills 与 selectedSkills
});`,
        },
      ],
    },
    cta: {
      eyebrow: "开源免费 · GPL-3.0",
      title: "喝杯咖啡的时间，读懂整个编码智能体核心。",
      subtitle: "去 GitHub 点个 Star、看看中文架构导览，或者免 API Key 直接在本地跑通 examples/custom-agent.ts。",
      primary: "前往 GitHub Star",
      secondary: "复制安装命令",
      copied: "已复制：npm install -g nano-codin",
      footerNote: "Nano Codin · 基于 TypeScript、ESM、Zod 与 Ink 构建 · GPL-3.0",
    },
  },
};
