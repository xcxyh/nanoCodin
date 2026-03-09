# Nano Codin

Nano Codin is a TypeScript-based coding agent CLI with a minimal, production-oriented architecture.
It uses a ReAct loop (Thought -> Action -> Observation), LangGraph orchestration, tool execution, and a terminal UI.

## Highlights

- ReAct single-agent loop built on LangGraph
- Pluggable tool registry (`fs`, `edit`, `shell`, `planning`)
- Repo index cache with `repo_index_query` for faster repo understanding
- Sandbox policy (`allow|ask|deny`) for shell tool execution
- Phase-aware loop (`discover -> plan -> execute -> verify -> finalize`)
- Single-step error recovery loop for common failures
- Token-threshold context compression with structured working memory
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
- `AGENT_RECURSION_LIMIT` controls LangGraph recursion guard. Default is derived from `AGENT_MAX_STEPS`.

### Project Personalization (`AGENTS.md` + `.nanocodin`)

Supported files in working directory:

- `AGENTS.md` (behavior constraints and collaboration preferences)
- `.nanocodin/config.toml` (runtime controls for agent/sandbox/index/recovery/compression)
- `.nanocodin/index.json` (auto-generated repo index cache)
- `.nanocodin/memory.md` (optional)
- `.nanocodin/context.md` (optional)

Precedence:

- CLI flags > `.nanocodin/config.toml` > `AGENTS.md` (guidelines only) > env > defaults

Example `.nanocodin/config.toml`:

```toml
[agent]
max_steps = 12
recursion_limit = 32
verify_required_keywords = ["fix", "bug", "implement", "refactor", "测试", "修复", "实现"]

[agent.phase_limits]
discover = 5
plan = 2
execute_verify = 10

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

### LangSmith Tracing (Optional)

Enable LangSmith tracing for LangGraph runs:

```bash
export LANGSMITH_TRACING=true
export LANGSMITH_API_KEY=lsv2_xxx
export LANGSMITH_PROJECT=nano-codin
# optional:
# export LANGSMITH_ENDPOINT=https://api.smith.langchain.com
```

Notes:

- Tracing is enabled only when both `LANGSMITH_TRACING=true` and an API key (`LANGSMITH_API_KEY` or `LANGCHAIN_API_KEY`) are set.
- The agent sends LangGraph run metadata (`cwd`, `maxSteps`, `initialMessageCount`) with each traced run.

## Usage

Run `nano-codin`, type a coding task, then press Enter.

Example prompts:

- `Create an Express hello-world server in ./examples/server.ts`
- `Find where tool parsing happens and explain the flow`
- `Replace all TODO comments in src with FIXME comments`

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
