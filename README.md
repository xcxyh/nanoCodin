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
███╗   ██╗ █████╗ ███╗   ██╗ ██████╗  ██████╗ ██████╗ ██████╗ ██╗███╗   ██╗
████╗  ██║██╔══██╗████╗  ██║██╔═══██╗██╔════╝██╔═══██╗██╔══██╗██║████╗  ██║
██╔██╗ ██║███████║██╔██╗ ██║██║   ██║██║     ██║   ██║██║  ██║██║██╔██╗ ██║
██║╚██╗██║██╔══██║██║╚██╗██║██║   ██║██║     ██║   ██║██║  ██║██║██║╚██╗██║
██║ ╚████║██║  ██║██║ ╚████║╚██████╔╝╚██████╗╚██████╔╝██████╔╝██║██║ ╚████║
╚═╝  ╚═══╝╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝  ╚═════╝ ╚═════╝ ╚═════╝ ╚═╝╚═╝  ╚═══╝
```

Nano Codin is a TypeScript-based coding agent CLI with a minimal, production-oriented architecture.
It uses a plain TypeScript ReAct loop (Thought -> Action -> Observation), tool execution, and a terminal UI.

## Highlights

- ReAct single-agent loop implemented directly in TypeScript
- AI SDK structured tool calling for tool selection, with text ReAct fallback
- Pluggable tool registry (`fs`, `edit`, `shell`, `planning`)
- Repo index cache with `repo_index_query` for faster repo understanding
- Layered prompt context from `AGENTS.md` and `~/.nanocodin/workspaces/<workspace-id>/{context,memory}.md`
- Sandbox policy (`allow|ask|deny`) for shell tool execution
- Phase-aware loop (`discover -> plan -> execute -> verify -> finalize`)
- Single-step error recovery loop for common failures
- Token-threshold context compression with structured session memory
- Lightweight delegated research subtasks via `delegate`
- Provider routing for OpenAI-compatible and Anthropic-compatible APIs
- Custom provider base URLs via `~/.nanocodin/config.yaml` or one-shot environment overrides
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

`nano-codin` now uses a user-scoped YAML config at `~/.nanocodin/config.yaml`.
On first run, if model configuration is missing, the CLI enters a bootstrap flow and asks for:

- `MODEL_PROVIDER`
- `base URL`
- `model`
- `api key`

The bootstrap flow writes `~/.nanocodin/config.yaml` and the same process continues without requiring a rerun.

Example generated config:

```yaml
model:
  provider: openai
  baseUrl: https://api.openai.com/v1
  name: gpt-4o-mini
  apiKey: your_key
```

You can still override the YAML file with shell environment variables when needed, which is useful for CI or temporary local testing:

```bash
export MODEL_PROVIDER=openai
export MODEL_NAME=gpt-4o-mini
export MODEL_API_KEY=your_key
# optional:
# export MODEL_BASE_URL=https://your-openai-compatible-endpoint/v1
nano-codin
```

Provider-specific compatibility env vars are still supported:

```bash
export OPENAI_API_KEY=your_key
export OPENAI_MODEL=gpt-4o-mini
```

```bash
export ANTHROPIC_API_KEY=your_key
export ANTHROPIC_MODEL=claude-3-5-haiku-latest
```

Optional runtime controls:

```bash
AGENT_MAX_STEPS=12
AGENT_RECURSION_LIMIT=32
# optional: force legacy text ReAct instead of structured tool calling
NANOCODIN_TEXT_REACT=1
```

Notes:

- `AGENT_MAX_STEPS` controls the ReAct loop stop condition.
- `AGENT_RECURSION_LIMIT` controls the local agent/tool transition guard. Default is derived from `AGENT_MAX_STEPS`.
- `NANOCODIN_TEXT_REACT=1` disables AI SDK structured tool calling for providers that do not support tools.

### Project Personalization (`AGENTS.md` + `~/.nanocodin`)

Relevant locations:

- `AGENTS.md` in the workspace (behavior constraints and collaboration preferences)
- `~/.nanocodin/config.yaml` (user-scoped runtime + model config)
- `~/.nanocodin/workspaces/<workspace-id>/repo-index.json` (repo index cache)
- `~/.nanocodin/workspaces/<workspace-id>/session-checkpoint.json` and `checkpoints/` (resume state)
- `~/.nanocodin/workspaces/<workspace-id>/memory.md` (optional persistent workspace memory)
- `~/.nanocodin/workspaces/<workspace-id>/context.md` (optional workspace context)

Precedence:

- CLI flags > shell env > `~/.nanocodin/config.yaml` > `AGENTS.md` (guidelines only) > defaults

Example `~/.nanocodin/config.yaml`:

```yaml
model:
  provider: openai
  baseUrl: https://api.openai.com/v1
  name: gpt-4o-mini
  apiKey: your_key

agent:
  maxSteps: 50
  recursionLimit: 96
  verifyRequiredKeywords: [fix, bug, implement, refactor, 测试, 修复, 实现]
  phaseLimits:
    discover: 32
    plan: 16
    executeVerify: 100
  compression:
    enabled: true
    tokenThresholdRatio: 0.7
    retainRecentRatio: 0.6
    contextTokenBudget: 6000

sandbox:
  defaultPolicy: ask
  timeoutMs: 15000
  maxOutputBytes: 8192
  askPrefixes: [npm install, git commit, git push, "curl "]
  allowPrefixes: [ls, cat, grep, rg, "npm run typecheck", "npm run build"]
  denyPatterns: ["rm -rf /", shutdown, reboot, mkfs, "dd if="]

repoIndex:
  enabled: true
  maxBytes: 5000000
  ignore: [.git, node_modules, dist, .next, coverage]

recovery:
  enabled: true
  maxRetryPerStep: 1
  dedupeWindowSteps: 2
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

- CLI flags > shell env > `~/.nanocodin/config.yaml` > `AGENTS.md` (guidelines only) > defaults

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
