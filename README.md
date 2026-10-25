# Nano Codin

A small TypeScript coding-agent Harness you can read, customize and embed. A terminal CLI is included.

[中文](./README.zh-CN.md) · [Feature decisions and architecture](./docs/REFACTOR.md)

## Why this project

One async loop, explicit tools, and replaceable integration points. Importing the core does not load Ink, model SDKs, shell tools or user configuration. Choose your own model, tools, instructions, interaction handler and storage.

The CLI uses that same core with eight coding tools, project rules, skills, command approval and optional session persistence. There are no graph nodes, phase gates, delegated agents, repository indexes or automatic long-term memory.

## CLI

Requires Node.js 20.5+.

```bash
npm install -g nano-codin
nano-codin
nano-codin "fix the failing tests"
nano-codin --print --prompt "inspect src/index.ts"
nano-codin --resume
nano-codin --review
```

Interactive startup guides model setup. Configuration is stored in `~/.nanocodin/config.yaml`; CLI overrides environment variables, then YAML, then defaults.

```bash
export MODEL_PROVIDER=openai
export MODEL_NAME=your-model
export MODEL_API_KEY=your-key
# Optional: MODEL_BASE_URL=https://your-compatible-endpoint/v1
nano-codin
```

```yaml
model:
  provider: openai
  name: your-model
  apiKey: your-key
  requestTimeoutMs: 600000
  idleTimeoutMs: 120000
  maxRetries: 1
agent:
  maxSteps: 50
  maxHistoryChars: 48000
sandbox:
  defaultPolicy: ask
  timeoutMs: 60000
```

Model request policy separates total and idle budgets. Response bytes refresh only the idle timer. Configure `model.requestTimeoutMs`, `idleTimeoutMs`, and `maxRetries`, or use `--model-timeout-ms`, `--model-idle-timeout-ms`, `--model-max-retries` and their `MODEL_REQUEST_TIMEOUT_MS`, `MODEL_IDLE_TIMEOUT_MS`, `MODEL_MAX_RETRIES` environment variables. Authentication/schema failures are not retried; cancellation stops retries. SDK retries are disabled so the adapter owns the bounded policy.

`maxSteps` limits model rounds per run. `maxHistoryChars` bounds tool history sent to the model, not the entire prompt. Saved sessions retain all events.

Common flags: `--cwd`, `--prompt`, `--print`, `--resume [id]`, `--review [id]`, `--new-session`, `--max-steps`, `--sandbox-policy`, `--sandbox-timeout-ms`, `--print-config`, `--help`, `--version`.

`--print` runs once without a TUI and prints only the final answer; noninteractive input selects it automatically.

In the TUI, execution records automatically collapse when a run ends; the history remains saved in the session. Press Ctrl+O to reopen the timeline and details, Up/Down to select an operation, and Left/Right to page through saved parameters and output. Closing details restores the input draft. Questions retain keyboard priority; Esc and Ctrl+C still cancel active work. Long detail lines wrap to the terminal width and oversized content is explicitly clipped.

Model requests display waiting time and request round. Commands show bounded stdout/stderr tails while running. Operation duration includes approval waiting; unfinished restored calls are labeled as interrupted. Plans show item counts, not overall task percentages. Raw model reasoning is not displayed. `run(..., { onProgress })` receives `{at, callId, stream, text}` snapshots; custom tools may use `context.onOutput({stream, text})`. Live snapshots are not saved or fed into model context; `tool_end` remains authoritative. Durable `model_start` / `model_end` events record request lifecycles, and display observer failures do not interrupt execution.

Exit codes: complete `0`, error `1`, incomplete `2`, cancelled `130`. Commands requiring approval fail explicitly when no interaction handler is available. Shell policies are command checks, not OS isolation.

In the TUI: `@` selects a file; `/` selects a command or skill. Use arrows to navigate, Enter to insert, then Enter again to submit. Esc closes a picker or cancels an active run. Ctrl+C cancels while running; press it twice to exit while idle. `/clear` starts a new session; `/quit` exits. Bordered input, task progress, highlighted approval choices and the model/token footer are retained.

## Embed the Harness

```ts
import { z } from "zod";
import { createAgent, defineTool } from "nano-codin";
import { createModelProvider } from "nano-codin/models";

const add = defineTool({
  name: "add",
  description: "Add two numbers",
  schema: z.object({ a: z.number(), b: z.number() }),
  async execute({ a, b }) {
    return { ok: true, output: String(a + b) };
  }
});

const agent = createAgent({
  model: createModelProvider({
    provider: "openai", name: "your-model",
    apiKey: process.env.MODEL_API_KEY!, baseUrl: null
  }),
  tools: [add],
  instructions: "Use add to calculate. Answer briefly."
});
const result = await agent.run("Calculate 2 + 3");
console.log(result.answer);
```

Supply your own `model.generate(messages, options)` to replace the provider entirely. See [the runnable custom-model example](./examples/custom-agent.ts), which needs no key or config:

```bash
npm install
node --import tsx examples/custom-agent.ts
```

| Extension point | Contract |
| --- | --- |
| `model` | Return tool calls or final text; the Harness executes tools |
| `tools` / `defineTool` | Description, Zod schema and execution function; context contains cwd, sessionId, signal and ask |
| `instructions` | String or async per-run instruction builder |
| `beforeFinish(session)` | Return a reason to continue; omit for a generic agent |
| `ask(request, signal)` | Inject interaction and approval UI; honor cancellation |
| `save(session)` | Optional storage callback; failures remain visible |
| `run(task, { onEvent, signal })` | Observe facts or cancel execution |

Default tools from `nano-codin/tools`: `ls`, `grep`, `view`, `create`, `str_replace`, `bash`, `todo`, `ask_user_question`. Select individual tools, use `createDefaultTools()`, or replace them all. `final` is reserved for completion.

For an existing file, keep using exact `str_replace`, or first `view` its SHA256 and explicitly pass `{mode:"rewrite",path,expectedHash,newText}`. `create` still never overwrites. Guarded edits use a version check and atomic replacement, preserve permission bits, and reject symlinks, hard links and special files. This is not a strict CAS against uncooperative concurrent writers. Text files are bounded to 8 MiB; clipped views provide continuation line/column metadata.

Known precondition failures report `changed=false`; potentially interrupted/script effects report `uncertainChanges=true`. Generic shell scripts are not a complete filesystem-change detector. Native assistant/tool history preserves ordering; provider-required continuation data stays private and is not displayed as reasoning or inserted into legacy text history. Missing/oversized continuation becomes explicit historical evidence, never an automatic replay. `RunResult.failure` provides typed request diagnostics; `FileSessionStore.loadResult()` distinguishes missing, corrupt, incompatible and unavailable records while `load()` remains nullable.

`ToolResult.effects` declares edits, plans and command evidence. The CLI's replaceable `requireVerification` hook checks successful validation after the latest declared edit. Custom tools and shell edits must declare effects accurately; this is not a complete filesystem-change detector or proof of test coverage.

A regular `run()` starts acceptance for a new task. Use `run(task, { continuation: true })` to retain the current plan and check requirements; CLI `continue` / `继续` and `--resume` use continuation semantics. Review retains changes across the full session.

Default bash verification requires a standalone command without edits. Run edits and checks separately; compound commands, pipelines and checks followed by edits do not establish verification. Under the default approval policy, utilities such as `find`, `sed`, `awk` and `tree` require confirmation. An explicit `allow` policy remains available. Cancellation and timeout terminate shell children and retain captured output. Resuming an unfinished write requires fresh verification and never automatically replays the write.

Optional adapters: `FileSessionStore` from `nano-codin/session`; `loadProjectInstructions` and skill discovery from `nano-codin/context`.

## Optional Handlebars prompts

The core accepts final instructions and does not import Handlebars. Use the independent adapter when you want editable templates:

```ts
import { createTemplateInstructions } from "nano-codin/templates";
import { loadProjectContext } from "nano-codin/context";

const instructions = createTemplateInstructions({
  file: "./prompts/system.hbs",
  data: (task, session) => loadProjectContext(process.cwd(), task, session)
});
// createAgent({ model, tools, instructions })
```

CLI template precedence: project `.nanocodin/prompts/system.hbs`, then `~/.nanocodin/prompts/system.hbs`, then the bundled default. File changes take effect on the next task.

Variables: `task`, `cwd`, `session`, `projectRules`, `projectContext`, `workspaceNotes`, `availableSkills`, and `selectedSkills` (name/path/content). Handlebars conditions, loops and partials are supported. Plaintext mode preserves quotes, `<`, and `&`; no HTML escaping is applied. `createTemplateRenderer({ helpers, partials })` creates an isolated renderer for custom layouts.

## Context and sessions

Project `AGENTS.md` is loaded verbatim. Optional `context.md` and `memory.md` under the workspace state directory are read-only notes. Skills are discovered in project `.agents/skills/`, `~/.nanocodin/skills/`, then `~/.agents/skills/`. Invoke `$skill-name` or `/skill-name` to load its body.

Session events live at `~/.nanocodin/workspaces/<workspace-id>/sessions/<id>.json`. Completion, errors, cancellation and budget stops are retained. Resume supplies recorded context and interrupted-call warnings; it never automatically replays writes. `--review` reads local evidence without calling a model.

Removed config keys (`phaseLimits`, `recursionLimit`, `repoIndex`, `recovery`, `compression`) are ignored; old CLI controls warn that they are deprecated. Legacy checkpoint files are preserved but not imported as new event sessions.

## Development

```bash
npm run typecheck
npm run test
npm run test:coverage
npm run test:package  # build + packed API/type checks
npm run build
npm pack --dry-run
```

Core: `src/api.ts`, `src/agent/`, `src/tools/registry.ts`. Optional adapters: `src/model/`, `src/session/store.ts`, `src/context/`. CLI/UI: `src/cli/`, `src/ui/`. Coding policy: `src/workflows/`.

Build clears obsolete output before compilation. `frontend/` is an independent landing page. Releases continue through `.github/workflows/release.yml` and `release/*` branches; this refactor does not publish automatically.

GPL-3.0.
