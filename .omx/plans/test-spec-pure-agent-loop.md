# Test Spec: Pure Agent Loop Without LangChain/LangSmith

## Regression Commands

- `npm run test -- tests/integration/agentGraphVerify.test.ts`
- `npm run test -- tests/unit/delegateTool.test.ts`
- `npm run test -- tests/unit/recoveryEngine.test.ts`
- `npm run test -- tests/unit/sessionCheckpoint.test.ts`

## Full Verification Commands

- `npm run typecheck`
- `npm run test`
- `npm run build`
- `rg -n "langchain|langsmith|LangGraph|LangSmith|@langchain" src package.json package-lock.json README.md README.zh-CN.md`

## Behavior Assertions

- Immediate final on a verify-required task is blocked and produces the existing verification guard observation.
- Mutating action with an existing todo plan remains allowed without prefilled verification commands.
- Token usage from multiple model calls is accumulated and reports mixed sources when sources differ.
- Immediate final answer emits the final token snapshot.
- Prompt trajectory before compression includes earlier tool observations and session memory summary.
- Abort signal causes `CodingAgentGraph.run()` to reject with `AbortError`.

## Static Assertions

- `src/agent/agentGraph.ts` has no `@langchain/*` imports.
- `src/observability/langsmith.ts` is deleted if unreferenced.
- `package-lock.json` no longer includes `node_modules/@langchain/*` or `node_modules/langsmith`.
