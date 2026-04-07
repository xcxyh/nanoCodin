# Nano Codin

[![CI](https://github.com/xcxyh/nanoCodin/actions/workflows/ci.yml/badge.svg)](https://github.com/xcxyh/nanoCodin/actions/workflows/ci.yml)
[![Release](https://github.com/xcxyh/nanoCodin/actions/workflows/release.yml/badge.svg)](https://github.com/xcxyh/nanoCodin/actions/workflows/release.yml)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPLv3-blue.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Ink](https://img.shields.io/badge/Terminal_UI-Ink-000000)](https://github.com/vadimdemedes/ink)
[![React](https://img.shields.io/badge/Frontend-React_18-61DAFB?logo=react&logoColor=white)](https://react.dev/)

[English](./README.md) | [中文](./README.zh-CN.md)

```text
  _   _                         ____          _ _       
 | \ | | __ _ _ __   ___      / ___|___   __| (_)_ __  
 |  \| |/ _` | '_ \ / _ \____| |   / _ \ / _` | | '_ \ 
 | |\  | (_| | | | | (_) |____| |__| (_) | (_| | | | | |
 |_| \_|\__,_|_| |_|\___/      \____\___/ \__,_|_|_| |_|
```

Nano Codin 是一个基于 TypeScript 的 Coding Agent CLI，采用简洁且面向生产的架构。
它使用纯 TypeScript ReAct 循环（Thought -> Action -> Observation）、工具执行以及终端 UI。

## 核心特性

- 直接用 TypeScript 实现的 ReAct 单代理循环
- 可插拔工具注册表（`fs`、`edit`、`shell`、`planning`）
- 通过 `repo_index_query` 仓库索引缓存提升仓库理解速度
- 从 `AGENTS.md`、`.nanocodin/context.md`、`.nanocodin/memory.md` 分层注入提示词上下文
- 为 shell 工具执行提供沙箱策略（`allow|ask|deny`）
- 阶段感知循环（`discover -> plan -> execute -> verify -> finalize`）
- 面向常见失败场景的单步错误恢复
- 基于 Token 阈值的上下文压缩与结构化 session memory
- 通过 `delegate` 支持轻量级委托式研究子任务
- 支持 OpenAI 兼容与 Anthropic 兼容 API 的 Provider 路由
- 支持通过环境变量自定义 Provider Base URL
- 基于 Ink 的终端 UI，逐步展示 Agent 输出
- 可通过 npm 分发的 CLI（`nano-codin`）

## 环境要求

- Node.js 20+
- npm 9+

## 安装

### 全局安装

```bash
npm install -g nano-codin
nano-codin
```

### 一次性运行

```bash
npx nano-codin
```

### 本地开发

```bash
git clone git@github.com:xcxyh/nanoCodin.git
cd nanoCodin
npm install
npm run dev
```

## 配置

`nano-codin` 始终从 `process.env` 读取配置。
`.env` 是可选的：如果当前工作目录存在 `.env`，它只会补齐系统环境变量中缺失的键（不会覆盖已有 shell 环境变量）。

可使用以下任一方式配置：

1. 系统环境变量（不需要 `.env`）
2. 在运行 `nano-codin` 的目录创建 `.env` 文件

### 如何设置环境变量

临时设置（仅当前终端会话生效）：

macOS/Linux（zsh/bash）：

```bash
export MODEL_PROVIDER=openai
export OPENAI_API_KEY=your_key
export OPENAI_MODEL=gpt-4o-mini
nano-codin
```

Windows PowerShell：

```powershell
$env:MODEL_PROVIDER="openai"
$env:OPENAI_API_KEY="your_key"
$env:OPENAI_MODEL="gpt-4o-mini"
nano-codin
```

Windows CMD：

```bat
set MODEL_PROVIDER=openai
set OPENAI_API_KEY=your_key
set OPENAI_MODEL=gpt-4o-mini
nano-codin
```

持久设置（后续终端自动加载）：

macOS/Linux（zsh）：

```bash
echo 'export MODEL_PROVIDER=openai' >> ~/.zshrc
echo 'export OPENAI_API_KEY=your_key' >> ~/.zshrc
echo 'export OPENAI_MODEL=gpt-4o-mini' >> ~/.zshrc
source ~/.zshrc
```

macOS/Linux（bash）：

```bash
echo 'export MODEL_PROVIDER=openai' >> ~/.bashrc
echo 'export OPENAI_API_KEY=your_key' >> ~/.bashrc
echo 'export OPENAI_MODEL=gpt-4o-mini' >> ~/.bashrc
source ~/.bashrc
```

### 示例：系统环境变量（推荐 CI/Server）

```bash
export MODEL_PROVIDER=openai
export OPENAI_API_KEY=your_key
export OPENAI_MODEL=gpt-4o-mini
# optional:
# export OPENAI_BASE_URL=https://your-openai-compatible-endpoint/v1
nano-codin
```

### 示例：`.env` 文件（本地开发）

```dotenv
MODEL_PROVIDER=openai
OPENAI_API_KEY=your_key
OPENAI_MODEL=gpt-4o-mini
# optional:
# OPENAI_BASE_URL=https://your-openai-compatible-endpoint/v1
```

### OpenAI-compatible

```bash
MODEL_PROVIDER=openai
OPENAI_API_KEY=your_key
OPENAI_MODEL=gpt-4o-mini
# optional:
# OPENAI_BASE_URL=https://your-openai-compatible-endpoint/v1
```

### Anthropic-compatible

```bash
MODEL_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_key
ANTHROPIC_MODEL=claude-3-5-haiku-latest
# optional:
# ANTHROPIC_BASE_URL=https://your-anthropic-compatible-endpoint/v1
```

可选共享覆盖：

```bash
MODEL_NAME=...
```

可选运行时控制：

```bash
AGENT_MAX_STEPS=12
AGENT_RECURSION_LIMIT=32
```

说明：

- `AGENT_MAX_STEPS` 控制 ReAct 循环停止条件。
- `AGENT_RECURSION_LIMIT` 控制本地 agent/tool 转换安全保护，默认值由 `AGENT_MAX_STEPS` 推导。

### 项目个性化（`AGENTS.md` + `.nanocodin`）

工作目录支持以下文件：

- `AGENTS.md`（行为约束与协作偏好）
- `.nanocodin/config.toml`（agent/sandbox/index/recovery/compression 运行时控制）
- `.nanocodin/index.json`（自动生成的仓库索引缓存）
- `.nanocodin/memory.md`（可选，持久项目记忆；可由 `read_context` 读取）
- `.nanocodin/context.md`（可选，项目背景上下文；可由 `read_context` 读取）

优先级：

- CLI flags > `.nanocodin/config.toml` > `AGENTS.md`（仅指南）> env > defaults

示例 `.nanocodin/config.toml`：

```toml
[agent]
max_steps = 50
recursion_limit = 96
verify_required_keywords = ["fix", "bug", "implement", "refactor", "测试", "修复", "实现"]

[agent.phase_limits]
discover = 32
plan = 16
execute_verify = 100

[sandbox]
default_policy = "ask"
timeout_ms = 15000
max_output_bytes = 8192
ask_prefixes = ["npm install", "git commit", "git push", "curl "]
allow_prefixes = ["ls", "cat", "grep", "rg", "npm run typecheck", "npm run build"]
deny_patterns = ["rm -rf /", "shutdown", "reboot", "mkfs", "dd if="]

[repo_index]
enabled = true
max_bytes = 5000000
ignore = [".git", "node_modules", "dist", ".next", "coverage"]

[recovery]
enabled = true
max_retry_per_step = 1
dedupe_window_steps = 2

[compression]
enabled = true
token_threshold_ratio = 0.7
retain_recent_ratio = 0.6
context_token_budget = 6000
```

## 使用方式

常见入口：

```bash
nano-codin
nano-codin "fix the failing tests"
nano-codin --prompt "inspect the repo and propose a plan"
nano-codin --resume
nano-codin --print-config
nano-codin --help
```

常用参数：

- `-h`, `--help`：显示帮助并退出
- `-v`, `--version`：输出版本并退出
- `--cwd <path>`：在指定工作区中运行
- `--prompt <text>`：以初始任务启动
- `--resume [session-id]`：恢复最近一次或指定 checkpoint
- `--new-session`：忽略可恢复的 checkpoint 状态
- `--print-config`：输出生效配置和来源路径
- `--max-steps <n>`
- `--recursion-limit <n>`
- `--sandbox-policy <allow|ask|deny>`
- `--sandbox-timeout-ms <n>`
- `--compression-threshold <0..1>`
- `--verify-keywords <a,b,c>`

配置优先级：

- CLI flags > `.nanocodin/config.toml` > `AGENTS.md`（仅指南）> env > defaults

交互模式：

- 运行 `nano-codin`，输入编码任务后按 Enter。

示例提示词：

- `Create an Express hello-world server in ./examples/server.ts`
- `Find where tool parsing happens and explain the flow`
- `Replace all TODO comments in src with FIXME comments`
- `Inspect the repo structure, read project context, then propose a 3-step plan with verification`

## 项目结构

```text
src/
  agent/
    reactLoop.ts
    agentGraph.ts
  core/
    messageTypes.ts
    toolTypes.ts
  llm/
    modelRouter.ts
  prompts/
    system.hbs
    react.hbs
    templateEngine.ts
  tools/
    fs/{ls,tree,grep,repo_index_query}.ts
    edit/{view,create,str_replace,insert}.ts
    shell/bash.ts
    planning/todo.ts
    registry.ts
  ui/
    consoleApp.tsx
  index.ts
scripts/
  copy-prompts.mjs
```

## 开发命令

```bash
npm run dev
npm run typecheck
npm run build
npm run start
```

## 发布（维护者）

```bash
npm run release:patch   # or release:minor / release:major
git push
git push --tags
npm publish --access public
```

发布保护：

- `preversion`：运行 typecheck + build + `npm pack --dry-run`
- `prepublishOnly`：运行 typecheck + build

发布前请更新 `CHANGELOG.md`。

## 自动化发布（GitHub Actions）

本仓库提供自动化发布工作流：

- `.github/workflows/release.yml`

### 作用

当你推送 `release/*` 分支时，它会：

1. 安装依赖
2. 更新版本（`package.json` + `package-lock.json`）
3. 执行 `typecheck` 和 `build`
4. 提交发布变更并创建 git tag
5. 发布到 npm
6. 将发布提交和 tag 推回远端

### 分支命名规范

- `release/patch` -> `npm version patch`
- `release/minor` -> `npm version minor`
- `release/major` -> `npm version major`
- `release/vX.Y.Z` -> 指定精确版本（例如 `release/v1.2.0`）

### 必需的 GitHub 设置

1. 仓库密钥：
   - `NPM_TOKEN`：具备发布权限的 npm automation token
2. 工作流权限：
   - `contents: write`（已在 workflow 中声明）
3. 确保 Actions 可以向 `release/*` 分支推送提交和 tag

### 示例

```bash
git checkout -b release/minor
git push -u origin release/minor
```

推送后，GitHub Actions 会自动发布新版本。

## 故障排查

如果在中国网络环境中 `npm install` 很慢或卡住：

```bash
npm config set registry https://registry.npmmirror.com
npm cache clean --force
npm install
```

诊断时快速失败：

```bash
npm install --fetch-retries=0 --fetch-timeout=15000 --verbose
```

## 贡献指南

1. Fork 并创建功能分支
2. 保持改动聚焦并具备类型约束
3. 运行 `npm run typecheck` 和 `npm run build`
4. 提交范围清晰、包含测试说明的 PR

## 许可证

GPL-3.0（见 `LICENSE`）。
