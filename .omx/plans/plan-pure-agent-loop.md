# Plan: Pure Agent Loop Without LangChain/LangSmith

## Requirements Summary

- Refactor the agent loop to remove LangChain/LangGraph and LangSmith framework usage while keeping nano-codin small and simple.
- Preserve the existing public runtime surface: `CodingAgentGraph` is constructed by `src/cli/runCli.ts:107` and consumed by the Ink UI via `src/ui/consoleApp.tsx:4`.
- Keep existing ReAct behavior: `Thought -> Action -> Observation -> final`, phase-aware loop, verification guard, checkpoint restore/save, context compression, token usage snapshots, recovery, and read-only delegated subtasks.
- Remove `@langchain/langgraph` from package dependencies and remove transitive LangSmith dependency from the lockfile.
- Update docs and metadata that currently advertise LangGraph/LangSmith.

## Current Code Facts

- `src/agent/agentGraph.ts:1` imports `Annotation`, `END`, `START`, and `StateGraph` from `@langchain/langgraph`.
- `src/agent/agentGraph.ts:22` defines LangGraph annotation state, but the state fields are plain TypeScript values that can become a local `AgentLoopState` interface.
- `src/agent/agentGraph.ts:116` builds a two-node graph (`agent` and `tools`) whose control flow is equivalent to a `while` loop: run agent node, stop if `finalAnswer`, otherwise run tools node, repeat.
- `src/agent/agentGraph.ts:157` creates LangSmith runnable config and `src/agent/agentGraph.ts:170` invokes the compiled LangGraph graph.
- `src/observability/langsmith.ts:1` imports LangChain/LangSmith tracing types/classes and exists only to create Runnable config.
- `src/agent/reactLoop.ts:70` already owns response parsing, and `src/agent/reactLoop.ts:160` already builds prompt messages without LangChain message classes.
- `src/agent/agentGraph.ts:225` handles final answers and verification guard.
- `src/agent/agentGraph.ts:321` handles tool execution, gate checks, checkpoint saving, verification state, memory update, and recovery.
- `src/agent/agentGraph.ts:654` recursively constructs a read-only sub-agent for `delegate`.
- `package.json:37` is the only direct LangChain package dependency.
- README references LangGraph at `README.md:8`, `README.md:23`, `README.md:27`, `README.md:188`, and LangSmith at `README.md:242`.

## Cleanup Plan

1. Lock behavior first with the existing integration suite before deleting framework code.
2. Replace the framework control-flow layer only; do not rewrite prompt parsing, tool policy, recovery, compression, checkpoint, or model provider logic.
3. Delete LangSmith-specific observability rather than replacing it with a new tracing abstraction. This keeps the project minimal and avoids new dependencies.
4. Remove the direct LangChain dependency from `package.json` and regenerate `package-lock.json` with npm.
5. Update public wording from "LangGraph orchestration" to "plain TypeScript ReAct loop".

## Acceptance Criteria

- `rg -n "langchain|langsmith|LangGraph|LangSmith|@langchain" src package.json package-lock.json README.md CHANGELOG.md` returns no active implementation/dependency references. Historical changelog entries may remain only if intentionally kept as past-release history.
- `CodingAgentGraph.run()` still returns `{ finalAnswer, steps }` and still accepts `messages`, `onEvent`, `checkpointRestore`, `resumeSessionId`, and `abortSignal`.
- A final response is still blocked when `requiresVerify` is true and no successful verification action has run.
- Successful final responses still append `Execution summary:` and clear checkpoints.
- Token usage still accumulates across model calls and emits the final token snapshot.
- Compression behavior still retains full uncompressed trajectory until configured thresholds are reached.
- Tool execution still enforces `agentPolicy` gates, updates session memory, updates verification state, saves checkpoints for mutating/verification/summary actions, and attempts one-step recovery on failed tool results.
- `delegate` still uses a read-only nested agent with bounded max steps and no checkpoint.
- Abort signals still restore the previous `toolContext.abortSignal` in `finally` and reject with `AbortError`.
- Package install graph no longer contains LangChain/LangSmith modules after lockfile regeneration.

## Implementation Steps

1. Run baseline checks:
   - `npm run typecheck`
   - `npm run test -- tests/integration/agentGraphVerify.test.ts`
   - Optional if time permits: `npm run test`

2. Add a small local state type in `src/agent/agentGraph.ts`:
   - Replace `AgentStateAnnotation` and `typeof AgentStateAnnotation.State` with an explicit `interface AgentLoopState`.
   - Keep the same fields currently declared at `src/agent/agentGraph.ts:22`: `messages`, `intermediate_steps`, `pending_action`, `finalAnswer`, `stepCount`, `phase`, `phaseVisits`, `requiresVerify`, `hasVerified`, `stepRecoveryCount`, `recoverySignatures`, `recoveryHistory`, `latestVerification`, `tokenUsage`.
   - Add a `createInitialState(messages: Message[]): AgentLoopState` helper so the initial state currently built at `src/agent/agentGraph.ts:140` stays centralized.

3. Replace the LangGraph runtime with a direct loop in `CodingAgentGraph.run()`:
   - Remove `private readonly graph`.
   - Remove the constructor graph builder at `src/agent/agentGraph.ts:116`.
   - Remove `createLangSmithRunnableConfig` and `RunnableConfig` usage at `src/agent/agentGraph.ts:157`.
   - Implement:
     - initialize state;
     - call `agentNode(state)`;
     - merge the partial returned by `agentNode` into state;
     - if `state.finalAnswer` exists, return it;
     - call `toolsNode(state)`;
     - merge the partial returned by `toolsNode` into state;
     - continue until final or `agentNode` triggers the existing max-step failure.
   - The merge must preserve the old LangGraph reducer semantics: append returned `messages`, replace returned `intermediate_steps`, replace scalar fields, and leave absent fields unchanged.

4. Make state transition helpers explicit and testable:
   - Introduce a private `mergeState(state, patch)` helper in `src/agent/agentGraph.ts`.
   - Type `agentNode()` and `toolsNode()` return values as `Promise<Partial<AgentLoopState>>`.
   - Avoid changing the bodies of final handling, tool handling, checkpoint saving, and recovery except where TypeScript types require it.

5. Remove LangSmith framework code:
   - Delete `src/observability/langsmith.ts` if no code imports it after step 3.
   - Remove optional LangSmith env documentation from README rather than replacing it.
   - If preserving some observability is needed later, prefer existing `onEvent` state snapshots instead of a new tracing dependency.

6. Remove dependency and lockfile entries:
   - Remove `@langchain/langgraph` from `package.json:37`.
   - Regenerate `package-lock.json` via npm so `@langchain/core`, `@langchain/langgraph*`, and `langsmith` transitive entries disappear.
   - Keep `ai`, OpenAI, Anthropic, Ink, React, execa, handlebars, and zod unchanged.

7. Update docs and descriptions:
   - Change `package.json:4` from "built with TypeScript, LangGraph, and Ink" to wording such as "built with TypeScript, a plain ReAct loop, and Ink".
   - Remove the LangGraph badge at `README.md:8`.
   - Update `README.md:23` and `README.md:27` to describe a plain TypeScript ReAct loop.
   - Update `README.md:187`/`README.md:188` so `AGENT_RECURSION_LIMIT` is described as an internal loop guard or deprecated compatibility knob, not a LangGraph recursion guard.
   - Remove the LangSmith tracing section at `README.md:242` or replace it with a short note that framework tracing was removed.
   - Update README project tree entry `README.md:309` only if file names change.

8. Run verification:
   - `npm run typecheck`
   - `npm run test`
   - `npm run build`
   - `rg -n "langchain|langsmith|LangGraph|LangSmith|@langchain" src package.json package-lock.json README.md`

## Risks and Mitigations

- Risk: LangGraph reducers appended `messages` while replacing most other fields; a naive object spread could drop tool/planner messages.
  Mitigation: implement `mergeState()` with explicit message append semantics and use existing tests around verification guard and prompt trajectory.
- Risk: Loop termination semantics could change because `recursionLimit` used to be enforced by LangGraph.
  Mitigation: keep `maxSteps` as the primary stop condition and repurpose `recursionLimit` as a local safety cap only if necessary; document the new meaning.
- Risk: State snapshots could lose final token usage.
  Mitigation: preserve calls to `emitStateSnapshot()` in final, action, tool, and restore paths; keep the tests at `tests/integration/agentGraphVerify.test.ts:223` and `tests/integration/agentGraphVerify.test.ts:271`.
- Risk: Deleting LangSmith may surprise users who set LangSmith env vars.
  Mitigation: note the removal in README/CHANGELOG if this change is released; do not silently keep a dead env section.
- Risk: Lockfile regeneration may change unrelated dependency versions.
  Mitigation: use the existing lockfile workflow and review `package-lock.json` diff for dependency removals only.

## Verification Plan

- Regression:
  - `npm run test -- tests/integration/agentGraphVerify.test.ts`
  - `npm run test -- tests/unit/delegateTool.test.ts`
  - `npm run test -- tests/unit/recoveryEngine.test.ts`
  - `npm run test -- tests/unit/sessionCheckpoint.test.ts`
- Full:
  - `npm run typecheck`
  - `npm run test`
  - `npm run build`
- Static cleanup:
  - `rg -n "langchain|langsmith|LangGraph|LangSmith|@langchain" src package.json package-lock.json README.md`

## Suggested Follow-Up Execution

- Best next mode: solo execute or `$ralph` if you want an autonomous implementation/verification loop.
- Recommended role if delegated: `executor` for `src/agent/agentGraph.ts` and docs/dependency cleanup; `verifier` only after the implementation patch exists.
- Avoid `$team` unless you want to split implementation/docs/verification lanes; the code change is localized enough that one owner should be faster and lower-risk.
