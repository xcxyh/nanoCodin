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

## Install

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
