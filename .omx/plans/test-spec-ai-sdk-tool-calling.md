# Test Spec: AI SDK Structured Tool Calling

## Targeted Tests

- `npm run test -- tests/unit/aiSdkTools.test.ts`
- `npm run test -- tests/unit/modelRouter.test.ts tests/unit/reactLoop.test.ts tests/integration/agentGraphVerify.test.ts`

## Full Verification

- `npm run typecheck`
- `npm run test`
- `npm run build`

## Assertions

- AI SDK tool adapter exposes each nano tool as a tool with `parameters` and no `execute`.
- AI SDK tool adapter includes synthetic `final`.
- Structured `ModelResponse.toolCall` is preferred over text parser in `agentGraph`.
- Structured `final` still triggers existing final answer path and verification guard.
- Existing text parser/fallback tests remain green.
- Provider fallback path preserves legacy `generateText({ prompt })` behavior.
