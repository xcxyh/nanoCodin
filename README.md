# Nano Codin

Nano Codin is a TypeScript-based coding agent CLI with a minimal, production-oriented architecture.
It uses a ReAct loop (Thought -> Action -> Observation), LangGraph orchestration, tool execution, and a terminal UI.

## Highlights

- ReAct single-agent loop built on LangGraph
- Pluggable tool registry (`fs`, `edit`, `shell`, `planning`)
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
git clone <your-repo-url>
cd nanoCodin
npm install
npm run dev
```

## Configuration

Set environment variables in your shell, or create a `.env` file in the working directory where you run `nano-codin`.

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
    fs/{ls,tree,grep}.ts
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

MIT (see `LICENSE`).
