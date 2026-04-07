# PRD: Pure Agent Loop Without LangChain/LangSmith

## Goal

Refactor nano-codin's agent runtime so the ReAct loop is implemented directly in TypeScript instead of through LangGraph/LangChain/LangSmith framework surfaces.

## Scope

- Replace LangGraph state graph orchestration in `CodingAgentGraph` with a local loop.
- Preserve `CodingAgentGraph` constructor and `run()` API for CLI/UI callers.
- Preserve ReAct prompt construction, tool execution, policy gates, context compression, checkpointing, recovery, token accounting, final summary, and delegated read-only subtask behavior.
- Remove LangSmith tracing integration rather than introducing a replacement tracing framework.
- Remove LangChain dependency entries from package metadata and lockfile.
- Update active user-facing docs to describe the plain TypeScript loop.

## Out Of Scope

- Rewriting model providers.
- Changing prompt format.
- Changing CLI flags or UI behavior.
- Introducing a new observability/tracing dependency.
- Editing generated `dist/` files directly.

## Acceptance Criteria

- `CodingAgentGraph.run()` still accepts `messages`, `onEvent`, `checkpointRestore`, `resumeSessionId`, and `abortSignal`.
- Verification-required tasks cannot return final before a successful verification action.
- Final answers still include `Execution summary:`.
- Token usage accumulation and final token state snapshots still work.
- Context compression preserves existing prompt trajectory behavior.
- Tool execution still updates memory, verification state, checkpoints, and recovery history.
- Delegated subtasks still run with read-only tools and no checkpoint.
- Abort still rejects with `AbortError` and restores prior `toolContext.abortSignal`.
- `package.json` no longer depends on `@langchain/langgraph`.
- Active source/docs/package metadata no longer reference LangGraph/LangSmith as current implementation.

## Verification

- `npm run typecheck`
- `npm run test`
- `npm run build`
- Static cleanup search for active LangChain/LangSmith references.
