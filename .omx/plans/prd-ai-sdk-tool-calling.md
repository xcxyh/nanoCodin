# PRD: AI SDK Structured Tool Calling

## Goal

Use AI SDK structured tool calling for tool selection so the model no longer depends on fragile `Action Input:` text formatting for normal tool calls.

## Scope

- Extend `ModelResponse` to carry a structured `toolCall`.
- Add an adapter from nano-codin `ToolRegistry`/Zod schemas to AI SDK `ToolSet` without `execute`.
- Update model providers to use AI SDK `tools` when enabled and fallback to text ReAct when unsupported or disabled.
- Update the agent loop to prefer structured `toolCall` and fallback to existing text parser.
- Add a synthetic `final` selection tool for final answers.
- Update tests and docs.

## Out Of Scope

- Letting AI SDK execute tools.
- Removing `parseAgentResponse()`.
- Rewriting UI/CLI APIs.
- Adding dependencies.

## Acceptance Criteria

- Structured tool calls produce existing `ToolCall { name, input }` objects.
- `ToolRegistry.execute()` remains the only real tool execution path.
- `final` can be selected as a synthetic structured tool and still passes through existing verification guard.
- Text ReAct fallback still works.
- Typecheck, tests, and build pass.
