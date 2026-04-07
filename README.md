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

Nano Codin is a TypeScript-based coding agent CLI with a minimal, production-oriented architecture.
It uses a plain TypeScript ReAct loop (Thought -> Action -> Observation), tool execution, and a terminal UI.

## Highlights

- ReAct single-agent loop implemented directly in TypeScript
- Pluggable tool registry (`fs`, `edit`, `shell`, `planning`)
- Repo index cache with `repo_index_query` for faster repo understanding
- Layered prompt context from `AGENTS.md`, `.nanocodin/context.md`, and `.nanocodin/memory.md`
- Sandbox policy (`allow|ask|deny`) for shell tool execution
- Phase-aware loop (`discover -> plan -> execute -> verify -> finalize`)
- Single-step error recovery loop for common failures
- Token-threshold context compression with structured session memory
- Lightweight delegated research subtasks via `delegate`
- Provider routing for OpenAI-compatible and Anthropic-compatible APIs
- Custom provider base URLs via environment variables
- Ink-powered terminal UI with step-by-step agent output
- npm-distributable CLI (`nano-codin`)

## Requirements

- Node.js 20+
- npm 9+

## Install

### Global install

```bash
npm install -g nano-codin
nano-codin
```

### One-off run

```bash
npx nano-codin
```

### Local development

```bash
git clone git@github.com:xcxyh/nanoCodin.git
cd nanoCodin
npm install
npm run dev
```

## Configuration

`nano-codin` always reads from `process.env`.
`.env` is optional: if a `.env` file exists in your current working directory, it only fills keys that are missing from system environment variables (it does not override existing shell env vars).

You can configure either way:

1. System environment variables (no `.env` required)
2. A `.env` file in the directory where you run `nano-codin`

### How to set environment variables

Temporary (current terminal session only):

macOS/Linux (zsh/bash):

```bash
export MODEL_PROVIDER=openai
export OPENAI_API_KEY=your_key
export OPENAI_MODEL=gpt-4o-mini
nano-codin
```

Windows PowerShell:

```powershell
$env:MODEL_PROVIDER="openai"
$env:OPENAI_API_KEY="your_key"
$env:OPENAI_MODEL="gpt-4o-mini"
nano-codin
```

Windows CMD:

```bat
set MODEL_PROVIDER=openai
set OPENAI_API_KEY=your_key
set OPENAI_MODEL=gpt-4o-mini
nano-codin
```

Persistent (auto-loaded for future terminals):

macOS/Linux (zsh):

```bash
echo 'export MODEL_PROVIDER=openai' >> ~/.zshrc
echo 'export OPENAI_API_KEY=your_key' >> ~/.zshrc
echo 'export OPENAI_MODEL=gpt-4o-mini' >> ~/.zshrc
source ~/.zshrc
```

macOS/Linux (bash):

```bash
echo 'export MODEL_PROVIDER=openai' >> ~/.bashrc
echo 'export OPENAI_API_KEY=your_key' >> ~/.bashrc
echo 'export OPENAI_MODEL=gpt-4o-mini' >> ~/.bashrc
source ~/.bashrc
```

### Example: system environment variables (recommended for CI/server)

```bash
export MODEL_PROVIDER=openai
export OPENAI_API_KEY=your_key
export OPENAI_MODEL=gpt-4o-mini
# optional:
# export OPENAI_BASE_URL=https://your-openai-compatible-endpoint/v1
nano-codin
```

### Example: `.env` file (local development)

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

Optional shared override:

```bash
MODEL_NAME=...
```

Optional runtime controls:

```bash
AGENT_MAX_STEPS=12
AGENT_RECURSION_LIMIT=32
```

Notes:

- `AGENT_MAX_STEPS` controls the ReAct loop stop condition.
- `AGENT_RECURSION_LIMIT` controls the local agent/tool transition guard. Default is derived from `AGENT_MAX_STEPS`.

### Project Personalization (`AGENTS.md` + `.nanocodin`)

Supported files in working directory:

- `AGENTS.md` (behavior constraints and collaboration preferences)
- `.nanocodin/config.toml` (runtime controls for agent/sandbox/index/recovery/compression)
- `.nanocodin/index.json` (auto-generated repo index cache)
- `.nanocodin/memory.md` (optional persistent project memory; read by `read_context`)
- `.nanocodin/context.md` (optional project context; read by `read_context`)

Precedence:

- CLI flags > `.nanocodin/config.toml` > `AGENTS.md` (guidelines only) > env > defaults

Example `.nanocodin/config.toml`:

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

## Usage

Common entry points:

```bash
nano-codin
nano-codin "fix the failing tests"
nano-codin --prompt "inspect the repo and propose a plan"
nano-codin --resume
nano-codin --print-config
nano-codin --help
```

Key flags:

- `-h`, `--help`: show usage and exit
- `-v`, `--version`: print version and exit
- `--cwd <path>`: run against a different workspace
- `--prompt <text>`: start with an initial task
- `--resume [session-id]`: resume the latest or a named checkpoint
- `--new-session`: ignore resumable checkpoint state
- `--print-config`: print effective config and source paths
- `--max-steps <n>`
- `--recursion-limit <n>`
- `--sandbox-policy <allow|ask|deny>`
- `--sandbox-timeout-ms <n>`
- `--compression-threshold <0..1>`
- `--verify-keywords <a,b,c>`

Config precedence:

- CLI flags > `.nanocodin/config.toml` > `AGENTS.md` (guidelines only) > env > defaults

Interactive mode:

- Run `nano-codin`, type a coding task, then press Enter.

Example prompts:

- `Create an Express hello-world server in ./examples/server.ts`
- `Find where tool parsing happens and explain the flow`
- `Replace all TODO comments in src with FIXME comments`
- `Inspect the repo structure, read project context, then propose a 3-step plan with verification`

## Project Structure

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

## Development

```bash
npm run dev
npm run typecheck
npm run build
npm run start
```

## Release (Maintainers)

```bash
npm run release:patch   # or release:minor / release:major
git push
git push --tags
npm publish --access public
```

Release safeguards:

- `preversion`: runs typecheck + build + `npm pack --dry-run`
- `prepublishOnly`: runs typecheck + build

Update `CHANGELOG.md` before publishing.

## Automated Release (GitHub Actions)

This repo includes an automated release workflow at:

- `.github/workflows/release.yml`

### What it does

When you push a `release/*` branch, it will:

1. Install dependencies
2. Bump version (`package.json` + `package-lock.json`)
3. Run `typecheck` and `build`
4. Commit release changes and create git tag
5. Publish to npm
6. Push release commit and tag back to remote

### Branch naming conventions

- `release/patch` -> `npm version patch`
- `release/minor` -> `npm version minor`
- `release/major` -> `npm version major`
- `release/vX.Y.Z` -> exact version (for example `release/v1.2.0`)

### Required GitHub settings

1. Repository secret:
   - `NPM_TOKEN`: npm automation token with publish permission
2. Workflow permissions:
   - `contents: write` (already declared in workflow)
3. Ensure Actions can push commits/tags to `release/*` branches

### Example

```bash
git checkout -b release/minor
git push -u origin release/minor
```

After push, GitHub Actions will publish the new version automatically.

## Troubleshooting

If `npm install` is slow or hangs in CN networks:

```bash
npm config set registry https://registry.npmmirror.com
npm cache clean --force
npm install
```

To fail fast during diagnosis:

```bash
npm install --fetch-retries=0 --fetch-timeout=15000 --verbose
```

## Contributing

1. Fork and create a feature branch
2. Keep changes focused and typed
3. Run `npm run typecheck` and `npm run build`
4. Open a PR with clear scope and test notes

## License

GPL-3.0 (see `LICENSE`).
