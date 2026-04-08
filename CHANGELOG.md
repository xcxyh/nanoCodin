# Changelog

All notable changes to this project should be documented in this file.

The format is based on Keep a Changelog and follows Semantic Versioning.

## [Unreleased]

### Changed
- Replaced external graph orchestration with a plain TypeScript ReAct loop while preserving the existing agent runtime API.
- Added AI SDK structured tool calling for tool selection while preserving the local tool execution path and text ReAct fallback.

### Removed
- Removed optional external tracing integration and its dependency chain to keep the CLI runtime minimal.

## [0.1.5] - 2026-04-06

### Added
- Task-level token usage tracking for agent runs, including provider-reported usage with heuristic fallback when the SDK omits usage metadata.
- New unit and integration coverage for token usage normalization, mixed-source aggregation, final-only snapshot emission, header formatting, and task-start reset behavior.

### Changed
- Console header now shows live task token usage while the agent runs and keeps the final total visible after completion.
- Token usage display now formats values in `k` units with a `tokens` suffix and preserves `estimated` / `mixed` source markers when applicable.
- Completion status lines now append the current task's total token usage after `Completed in x step(s)`.

### Fixed
- Final-only model responses now still emit a last token snapshot, so the header does not miss the final total when no tool observation follows.
- Starting a new task now clears the previous task's snapshot before the next token total appears, preventing stale token carry-over in the header.
- `sandbox.allow_prefixes` commands now bypass the permission prompt correctly instead of being treated like `ask` policy commands.
- Pressing `Esc` now triggers a real run cancellation path through the model and shell execution chain, so a cancelled task no longer keeps running in the background while a new task starts.

## [0.1.4] - 2026-04-04

### Fixed
- CLI direct-run detection now resolves symlinked bin paths correctly, so `nano-codin` starts normally when installed via `npm link` or a global package symlink.
- Added a smoke-test regression case covering symlinked `argv[1]` entry resolution.

## [0.1.3] - 2026-04-04

### Added
- Minimal command shell support for the CLI runtime.

## [0.1.2] - 2026-04-04

### Added
- Runtime config system with precedence: CLI > `.nanocodin/config.toml` > `AGENTS.md` guidelines > env > defaults.
- New core config/types: `ResolvedRuntimeConfig`, sandbox/index/recovery/compression settings.
- Repo indexing service with incremental refresh and cache at `.nanocodin/index.json`.
- New `repo_index_query` tool for path/symbol/keyword repo lookups.
- Recovery engine with single-step auto-retry for common failures and dedupe window control.
- Context compression manager with structured working memory and token-threshold trigger.
- `.nanocodin/config.toml.example` template and README personalization documentation.
- Automated test stack based on Vitest with coverage thresholds and new scripts: `test`, `test:watch`, `test:coverage`, `verify`.
- New test suites across `tests/unit`, `tests/integration`, and `tests/smoke`, plus shared fixtures under `tests/fixtures`.
- New CI workflow `.github/workflows/ci.yml` to enforce `typecheck + test + coverage` on PRs and pushes to main branches.
- Layered context loading from `AGENTS.md`, `.nanocodin/context.md`, and `.nanocodin/memory.md`.
- Structured `sessionMemory` model for compressed task state, plus prompt sections for execution state.
- New `read_context`, `delegate`, and `summarize_changes` tools.
- Lightweight subtask delegation with structured result statuses (`success`, `failed`, `no_conclusion`, `limit_reached`).
- Session checkpoint persistence at `.nanocodin/session-checkpoint.json` for continuing interrupted tasks.
- Agent policy helpers to centralize tool capability checks and phase gating.
- New tests covering checkpoint persistence, repo index cache location, permission prompt reasons, delegation status handling, and UI state snapshots.

### Changed
- `bash` tool upgraded to policy-driven sandbox (`allow|ask|deny`) with structured output fields (`exit_code`, `stdout_tail`, `stderr_tail`, `duration_ms`, `policy_decision`) and in-memory command logs.
- Agent loop upgraded with phase state (`discover -> plan -> execute -> verify -> finalize`), phase budgets, plan gate, verify gate, and structured max-step failure summaries.
- Prompt pipeline now injects AGENTS guidelines and working-memory context.
- Default phase limit for `discover` increased from `3` to `5`; phase classification tuned so repeated read actions move into `execute`.
- Console UI refactored to reducer-based architecture with clear separation of state/event mapping/render helpers.
- Observation logs in console now default to one-line collapsed summaries with omitted line counts.
- Console now shows in-log `Thinking...` loading placeholder (animated dots) during model reasoning windows.
- `index.ts` now exports `main`, `buildRuntimeEnv`, and `parsePositiveIntEnv`, with direct-run guard to support smoke testing without auto-start on import.
- `configLoader` and `bash` policy helpers now export selected pure functions for unit testing without changing runtime behavior.
- Contributing docs now require `npm run verify`; `coverage/` is ignored in git.
- Prompt assembly now uses layered project context, structured session memory, and explicit execution-state sections instead of only guideline injection.
- Todo planning now records verification goal, verification commands, latest verification result, and verification status.
- Final answers now consistently append a structured execution summary covering changes, verification, residual risks, and subtask use.
- Permission prompts now include a human-readable reason for why the tool needs approval.
- Console UI now surfaces phase, todo state, verification state, subtask summaries, next action, and touched files while the agent runs.
- Repo index persistence now defaults to a per-workspace cache under the system temp directory instead of writing into the repo on every run.
- Console input now supports `@`-triggered file search with inline picker navigation and path insertion.

### Fixed
- Tool parsing now handles inline JSON in `Action` lines (e.g. `Action: tree {"path":"src"}`) and HTML-escaped JSON payloads.
- Tool registry now falls back to split-and-parse when tool name and JSON input are merged, fixing false `Unknown tool` errors for valid tools like `tree` and `view`.
- Mutating actions are now blocked unless a bounded todo plan exists and verification details are defined, reducing unsafe execute-path transitions.
- Delegated subtasks no longer behave like opaque happy-path summaries; failure and inconclusive outcomes are surfaced explicitly to the main task.
- Console input handling now keeps cursor movement and deletion semantics consistent across Mac terminal key sequences.
- File search picker rendering now clears cleanly when the candidate list closes, avoiding stale UI above the input bar.

## [0.1.0] - 2026-03-07

### Added
- Minimal ReAct coding agent with LangGraph loop.
- Tool registry with filesystem, edit, shell, and todo tools.
- Ink console UI and model router supporting OpenAI/Anthropic-compatible endpoints.
