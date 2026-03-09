# Changelog

All notable changes to this project should be documented in this file.

The format is based on Keep a Changelog and follows Semantic Versioning.

## [Unreleased]

### Added
- Runtime config system with precedence: CLI > `.nanocodin/config.toml` > `AGENTS.md` guidelines > env > defaults.
- New core config/types: `ResolvedRuntimeConfig`, sandbox/index/recovery/compression settings.
- Repo indexing service with incremental refresh and cache at `.nanocodin/index.json`.
- New `repo_index_query` tool for path/symbol/keyword repo lookups.
- Recovery engine with single-step auto-retry for common failures and dedupe window control.
- Context compression manager with structured working memory and token-threshold trigger.
- `.nanocodin/config.toml.example` template and README personalization documentation.

### Changed
- `bash` tool upgraded to policy-driven sandbox (`allow|ask|deny`) with structured output fields (`exit_code`, `stdout_tail`, `stderr_tail`, `duration_ms`, `policy_decision`) and in-memory command logs.
- Agent loop upgraded with phase state (`discover -> plan -> execute -> verify -> finalize`), phase budgets, plan gate, verify gate, and structured max-step failure summaries.
- Prompt pipeline now injects AGENTS guidelines and working-memory context.
- Default phase limit for `discover` increased from `3` to `5`; phase classification tuned so repeated read actions move into `execute`.
- Console UI refactored to reducer-based architecture with clear separation of state/event mapping/render helpers.
- Observation logs in console now default to one-line collapsed summaries with omitted line counts.
- Console now shows in-log `Thinking...` loading placeholder (animated dots) during model reasoning windows.

### Fixed
- Tool parsing now handles inline JSON in `Action` lines (e.g. `Action: tree {"path":"src"}`) and HTML-escaped JSON payloads.
- Tool registry now falls back to split-and-parse when tool name and JSON input are merged, fixing false `Unknown tool` errors for valid tools like `tree` and `view`.

## [0.1.0] - 2026-03-07

### Added
- Minimal ReAct coding agent with LangGraph loop.
- Tool registry with filesystem, edit, shell, and todo tools.
- Ink console UI and model router supporting OpenAI/Anthropic-compatible endpoints.
