# Minimal ReAct Coding Agent (TypeScript)

A minimal but production-quality single-agent coding assistant built with:
- TypeScript + Node.js 20+
- LangGraph JS (ReAct loop)
- Ink (console UI)
- Handlebars (prompt templates)
- Vercel AI SDK (OpenAI/Anthropic provider routing)

## Requirements

- Node.js 20+
- npm

## Local Development

```bash
npm install
cp .env.example .env
```

## Configure Providers

### OpenAI provider

```bash
MODEL_PROVIDER=openai
OPENAI_API_KEY=your_key
OPENAI_MODEL=gpt-4o-mini
# optional custom base URL
OPENAI_BASE_URL=https://your-openai-compatible-endpoint/v1
```

### Anthropic provider

```bash
MODEL_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_key
ANTHROPIC_MODEL=claude-3-5-haiku-latest
# optional custom base URL
ANTHROPIC_BASE_URL=https://your-anthropic-proxy
```

Optional shared model override:

```bash
MODEL_NAME=...
```

## Run

```bash
npm run dev
```

Then type a task in the console UI and press Enter.

## Install as npm CLI (for end users)

After this package is published to npm, users can install and run:

```bash
npm install -g nano-codin
nano-codin
```

Or run without global install:

```bash
npx nano-codin
```

Before running, set environment variables in your shell (recommended):

```bash
export MODEL_PROVIDER=openai
export OPENAI_API_KEY=your_key
export OPENAI_MODEL=gpt-4o-mini
# optional:
# export OPENAI_BASE_URL=https://your-openai-compatible-endpoint/v1
```

You can also create a local `.env` file in your working directory with the same variables.

## Publish to npm (for maintainers)

1. Login and verify package name:

```bash
npm login
npm view nano-codin
```

2. Build and validate:

```bash
npm run typecheck
npm run build
npm pack
```

3. Bump version (auto commit + git tag):

```bash
npm run release:patch
# or:
# npm run release:minor
# npm run release:major
```

4. Push commit and tag:

```bash
git push
git push --tags
```

5. Publish:

```bash
npm publish --access public
```

Notes:
- `prepublishOnly` already runs `typecheck` + `build`.
- `preversion` runs `typecheck` + `build` + `npm pack --dry-run`.
- CLI command is `nano-codin` (configured via `package.json` `bin`).
- Prompt templates are copied to `dist/prompts` during build.
- Update [`CHANGELOG.md`](/Users/xiongmac/code/nanoCodin/CHANGELOG.md) before each release.

## Architecture

```text
agent/
  reactLoop.ts
  agentGraph.ts
llm/
  modelRouter.ts
tools/
  fs/{ls,tree,grep}.ts
  edit/{view,create,str_replace,insert}.ts
  shell/bash.ts
  planning/todo.ts
  registry.ts
prompts/
  system.hbs
  react.hbs
  templateEngine.ts
ui/
  consoleApp.tsx
core/
  toolTypes.ts
  messageTypes.ts
index.ts
```

## Tool Summary

- Filesystem: `ls`, `tree`, `grep`
- Editing: `view`, `create`, `str_replace`, `insert`
- Shell: `bash` (blocklist + timeout safety)
- Planning: `todo` (in-memory list operations)

## Notes and Limitations

- Single-agent only
- No persistence (todo is in-memory per session)
- Step-level streaming in UI (not token streaming)
- Prompt output is format-constrained for ReAct parsing

## npm install Troubleshooting (CN Network)

If `npm install` appears stuck, it is usually DNS/network retries to `registry.npmjs.org`.
This repo includes a local `.npmrc` using `https://registry.npmmirror.com` for better stability.

Quick checks:

```bash
npm config get registry
nslookup registry.npmjs.org
```

If needed, force the mirror again:

```bash
npm config set registry https://registry.npmmirror.com
npm cache clean --force
npm install
```

To fail fast instead of waiting for long retries:

```bash
npm install --fetch-retries=0 --fetch-timeout=15000 --verbose
```
