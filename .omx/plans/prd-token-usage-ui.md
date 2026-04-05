# PRD: Task-Level Token Usage In Top Snapshot

## Requirements Summary

目标是在现有 CLI UI 的顶部状态区增加任务级 token usage 展示，并在 agent 运行期间实时刷新累计值，任务结束后保留最终值。该需求必须保持现有日志流行为不变，不展示每次 LLM 调用的明细列表。

当前代码证据表明，这个改动需要穿透 provider、agent 执行态、snapshot 映射和顶部渲染链路：
- `ModelResponse` 目前只有 `text`，没有 usage 元数据，见 `src/core/messageTypes.ts:21`。
- `OpenAIProvider` 和 `AnthropicProvider` 当前都只从 `generateText(...)` 返回 `text`，见 `src/llm/modelRouter.ts:68` 与 `src/llm/modelRouter.ts:98`。
- 已安装 AI SDK 的本地类型已明确 `generateText` 结果包含 `usage`，且 `LanguageModelUsage` 字段为 `promptTokens / completionTokens / totalTokens`，见 `node_modules/ai/dist/index.d.ts:252`、`node_modules/ai/dist/index.d.ts:2142`、`node_modules/ai/dist/index.d.ts:2239`。
- agent 事件和快照还没有 token 字段，见 `src/agent/reactLoop.ts:22`、`src/agent/reactLoop.ts:30`、`src/agent/reactLoop.ts:190`。
- state snapshot 通过 `emitStateSnapshot(...)` 推送到 UI，见 `src/agent/agentGraph.ts:613` 与 `src/agent/agentGraph.ts:616`。
- UI 侧只保存 `latestSnapshot` 并映射 `state` event，见 `src/ui/consoleState.ts:24`、`src/ui/consoleState.ts:35`、`src/ui/consoleState.ts:313`、`src/ui/consoleState.ts:341`。
- 顶部状态区渲染位于 `ConsoleHeader`，见 `src/ui/consoleComponents.tsx:128`。
- 现有 `task_start` 会保留上一次 `latestSnapshot`，不会主动清空，因此若要满足“保留到下一次任务开始”，需要显式定义新任务起始时的 token reset 语义，见 `src/ui/consoleState.ts:163`。
- checkpoint 当前只持久化 `sessionMemory`、`todos` 和 `latestVerification`，没有 usage 字段；对应类型定义见 `src/core/toolTypes.ts:119`，文件存储实现见 `src/services/sessionCheckpoint.ts:43` 与 `src/services/sessionCheckpoint.ts:104`。
- 现有相关单测只覆盖 snapshot 存储基础路径，见 `tests/unit/consoleState.test.ts:23`。

## RALPLAN-DR Summary

### Principles

1. 优先复用现有 `state snapshot -> latestSnapshot -> ConsoleHeader` 刷新链路，不引入平行 UI 状态通道。
2. 真实 usage 优先，缺失时估算，但 UI 不得空白或报错。
3. 任务级累计是产品边界，调用级明细不进入首版。
4. 改动应保持 CLI 行为稳定，优先小而可 review 的 diff。
5. 测试覆盖状态流转与展示口径，而不是只覆盖静态类型扩展。
6. usage 的刷新时机必须跟随 LLM 调用完成，而不是被动依赖 tool observation 之后才更新。

### Decision Drivers

1. 用户明确要求“运行时实时展示”，因此必须在执行过程中持续刷新，而不是仅在最终 summary 中追加文本。
2. 现有架构已经有 snapshot 驱动 UI 的机制，最低风险路径是扩展 snapshot，而不是新增 usage event 流。
3. AI SDK 已提供 `usage` 类型，真实 usage 的主方案具备本地代码证据；估算只作为 fallback。

### Viable Options

#### Option A: 扩展 `ModelResponse` + 累计到 `AgentExecutionSnapshot`，由现有 state event 驱动 UI

Approach:
- 在 provider 层返回 usage 元数据
- 在 agent graph 每次 LLM 调用后累加任务级 token usage
- 把累计值并入 `AgentExecutionSnapshot`
- UI 继续仅消费 `latestSnapshot`

Pros:
- 最大程度复用现有 `emitStateSnapshot(...)` 机制，变更面集中在单一路径
- 与用户要的“顶部状态区实时刷新”直接对齐
- 测试边界清晰：provider 归一化、snapshot 累计、UI 渲染

Cons:
- 需要给 agent state 增加 usage 累计字段
- 需要定义真实值与估算值并存时的归一化结构
- 若不同时调整 snapshot 发射时机，实时刷新与 final-only 回合会漏更

#### Option B: 新增独立 `usage` event，由 UI 自己维护累计状态

Approach:
- 保持 `AgentExecutionSnapshot` 不变
- 增加 `AgentEvent` 的 usage 类型
- `consoleState` 单独维护 token usage 并驱动顶部渲染

Pros:
- 不必扩展现有 snapshot 类型
- usage 更新频率可以独立于其他 snapshot

Cons:
- 形成第二条 UI 状态通路，复杂度高于需求规模
- 容易与 `latestSnapshot` 失步，增加 reducer 和测试成本
- 对后续 checkpoint/restore 场景更不一致

#### Option C: 只在任务结束时总结并显示最终 token

Approach:
- 不做运行中刷新
- 仅在完成时将 token 文本追加到 summary 或 snapshot

Pros:
- 实现最小

Cons:
- 直接违背用户“运行时实时展示”的核心要求
- 不是可接受方案

### Recommendation

选择 **Option A**。它与现有架构最一致，能直接利用 `agentGraph -> state snapshot -> consoleState -> ConsoleHeader` 这条已存在的刷新路径，同时满足实时更新和任务级累计的产品边界。Option B 在当前项目规模下会引入不必要的第二状态通道。Option C 与用户确认边界冲突，应排除。

## Recommended Approach

采用“provider 归一化 + graph 内累计 + snapshot 扩展 + 顶部展示”的四段式设计：

1. 在 `src/core/messageTypes.ts` 中扩展 `ModelResponse`，增加统一的 per-call token usage 结构；同时为任务级累计单独定义聚合结构，避免把 provider 细节直接泄漏到 UI。
2. 在 `src/llm/modelRouter.ts` 中读取 AI SDK `generateText(...)` 返回的 `usage`；当不存在 usage 时，对当前 prompt/text 做项目内估算，生成统一 usage 结构。
3. 在 `src/agent/agentGraph.ts` 中增加任务级累计 usage 状态，并在每次 `model.generate(...)` 成功后立即累加；snapshot 需要在该时点和 final 路径上都可见，不能只依赖 tool 完成后的 `emitStateSnapshot(...)`。
4. 在 `src/agent/reactLoop.ts` 扩展 `AgentExecutionSnapshot`，在 `src/ui/consoleState.ts` 保持映射不变，在 `src/ui/consoleComponents.tsx` 的 `ConsoleHeader` 新增 token 行。

字段粒度建议采用 `Tokens: input / output / total`，但必须把展示结构设计成可降级格式，避免在 mixed-source 聚合时形成“看起来精确”的错误承诺。聚合结构建议至少支持 `actual | estimated | mixed` 三种来源语义。

## Testable Acceptance Criteria

1. 单次任务启动后，顶部状态区在运行期间会显示并刷新本次任务的累计 token。
2. 累计 token 的口径是“完整任务生命周期内所有 LLM 调用之和”，而不是单次调用明细。
3. 当 provider 返回真实 usage 时，累计值基于真实 usage 累加。
4. 当 provider 未返回 usage 时，系统回退到估算值，顶部状态区仍显示 token，不为空，不报错。
5. 顶部状态区展示不会向日志流新增任何 token usage 日志。
6. 任务结束、失败、取消后，顶部状态区仍保留本次任务最后一次累计 token 值，直到下一次任务开始。
7. 当任务最后一个回合是直接 `final`、没有后续 tool observation 时，顶部状态区仍能看到最终累计 token。
8. 新任务开始时，上一任务的 token 值不会继续伪装成当前任务累计值；必须在任务起始阶段被清空或重置为新任务上下文。

## Implementation Steps

1. 定义统一 usage 模型
   - 文件：
     - `src/core/messageTypes.ts:21`
   - 工作：
     - 为 `ModelResponse` 增加可选 `usage` 字段
     - 定义 per-call `TokenUsage` 结构，至少包含 `promptTokens`、`completionTokens`、`totalTokens`、`source`
     - 单独定义任务级累计类型，至少支持 `actual | estimated | mixed` 来源语义，避免 UI 直接使用 provider 原始结构

2. 在 provider 层接入真实 usage 和 fallback 估算
   - 文件：
     - `src/llm/modelRouter.ts:68`
     - `src/llm/modelRouter.ts:98`
     - 证据参考：`node_modules/ai/dist/index.d.ts:252`、`node_modules/ai/dist/index.d.ts:2142`、`node_modules/ai/dist/index.d.ts:2239`
   - 工作：
     - 从 `generateText(...)` 解构 `usage`
     - 归一化 OpenAI / Anthropic 统一返回结构
     - usage 缺失时，按项目内策略估算 prompt/completion/total
     - 保持 provider 错误行为不变，只扩展成功路径返回值

3. 在 graph state 中累加任务级 usage
   - 文件：
     - `src/agent/agentGraph.ts:22`
     - `src/agent/agentGraph.ts:133`
     - `src/agent/agentGraph.ts:202`
     - `src/agent/agentGraph.ts:222`
     - `src/agent/agentGraph.ts:616`
     - `src/core/toolTypes.ts:119`
     - `src/services/sessionCheckpoint.ts:43`
     - `src/services/sessionCheckpoint.ts:104`
   - 工作：
     - 给 graph annotation/state 增加累计 token usage 字段
     - 每次 `this.model.generate(...)` 成功后累加 usage
     - 明确在 LLM 成功返回后立即刷新 snapshot，且 final 分支也要携带最终累计值
     - 在正常运行时始终从同一累计状态发出 snapshot，避免依赖 tool observation 的时序偶然性
     - 对 restore checkpoint 明确采用“兼容但不续算”的首版策略，除非执行阶段同时扩展 checkpoint schema
     - 明确 task_start 重置累计值，task_end/failure/cancel 保留最后值

4. 扩展 snapshot 契约并保持 UI reducer 简单
   - 文件：
     - `src/agent/reactLoop.ts:30`
     - `src/agent/reactLoop.ts:190`
     - `src/ui/consoleState.ts:24`
     - `src/ui/consoleState.ts:163`
     - `src/ui/consoleState.ts:313`
     - `src/ui/consoleState.ts:341`
   - 工作：
     - 在 `AgentExecutionSnapshot` 中增加 token usage 汇总字段
     - `buildAgentExecutionSnapshot(...)` 输出该字段
     - `consoleState` 继续通过 `set_snapshot` 存储 `latestSnapshot`，避免新增并行 reducer 状态
     - 明确新任务开始时如何清空上一任务 token 展示，避免 header 在首个 snapshot 到来前沿用旧值

5. 在顶部状态区渲染 token usage
   - 文件：
     - `src/ui/consoleComponents.tsx:128`
   - 工作：
     - 在 `ConsoleHeader` 增加 `Tokens: input / output / total` 或最小化字符串格式化逻辑
     - 对 `actual` / `estimated` / `mixed` 增加轻量标记，例如 `estimated`
     - 不修改日志列表渲染逻辑

6. 增补测试
   - 文件：
     - `tests/unit/consoleState.test.ts:23`
     - `tests/integration/agentGraphVerify.test.ts:57`
     - `tests/unit/sessionCheckpoint.test.ts:28`
     - 建议新增或扩展：
       - `tests/unit/modelRouter*.test.ts`
       - `tests/unit/reactLoop*.test.ts`
   - 工作：
     - 测 provider 真实 usage 归一化
     - 测 usage 缺失时 fallback 估算
     - 测 snapshot 包含 token 字段并能被 `uiReducer` 保留
     - 测任务结束后 snapshot 保留最终累计值
     - 测 restore/checkpoint 路径对新增 usage 字段保持兼容，即使本轮不续算
     - 测 `final-only` 路径仍会发出最终 snapshot
     - 测新任务开始时 token 展示被重置，不沿用旧任务累计值

## Risks and Mitigations

1. 风险：provider usage 字段并非所有调用都稳定返回
   - Mitigation：将估算策略收敛在 `modelRouter`，对上层始终返回统一结构。

2. 风险：在 UI 层单独累加 usage 会造成 snapshot 与 header 失步
   - Mitigation：不采用 UI 累加；只在 graph 内累计，再通过单一 snapshot 通道渲染。

3. 风险：checkpoint restore 后 token usage 丢失或重置
   - Mitigation：当前 `SessionCheckpoint` schema 只包含 `sessionMemory`、`todos`、`latestVerification`（`src/core/toolTypes.ts:119`），`FileSessionCheckpointStore` 的读写也没有 usage 字段（`src/services/sessionCheckpoint.ts:43`、`src/services/sessionCheckpoint.ts:104`）。因此首版明确不把 usage 连续性纳入硬验收，只要求 restore 路径对新增字段兼容、不崩溃；若后续需要续算，再单独扩展 checkpoint schema。

4. 风险：估算算法口径过粗，用户误以为是精确值
   - Mitigation：统一通过 `source` 标记区分 `actual`、`estimated` 和 `mixed`，在 UI 上显示轻量来源标识。

5. 风险：顶部状态区信息过多导致可读性下降
   - Mitigation：只增加一行 token usage，不改变现有布局和日志行为。

6. 风险：真实 usage 与 estimated fallback 在同一任务内混合出现，单一 `source` 无法准确表达
   - Mitigation：任务级聚合结构支持 `mixed`，并在 UI 上用轻量标记说明来源混合。

7. 风险：snapshot 只在 tool 结束后发射，导致 final-only 回合和实时刷新失真
   - Mitigation：把“在 LLM 成功返回后立即发射/更新 snapshot”写成实现约束和测试点。

## Verification Steps

1. `npm run typecheck`
   - 证明新增 usage 类型贯穿 provider、graph、snapshot、UI 渲染链路且无 TS 错误。
2. `npm run test`
   - 证明 provider fallback、snapshot 存储和 UI 状态行为都有回归保障。
3. 如新增针对 header 的渲染测试或 snapshot 测试，逐项确认：
   - 真实 usage 路径
   - estimated fallback 路径
   - mixed-source 路径
   - 任务结束后保留最终累计值
   - final-only 回合仍显示最终累计值
   - 新任务开始后不会沿用旧任务 token
4. 手动运行一个最小任务，确认顶部状态区在任务执行中可见 token 递增，且日志区无新增 token 行。

## ADR

### Decision

采用“在 provider 层归一化 usage、在 graph 内做任务级累计、通过扩展后的 `AgentExecutionSnapshot` 驱动顶部状态区”的方案。

### Drivers

- 用户要求任务级、实时、顶部状态区、无调用明细。
- AI SDK 已提供 usage 字段，真实 usage 主路径具备代码证据。
- 现有 UI 已依赖 state snapshot 刷新，复用该链路风险最低。

### Alternatives Considered

- 独立 `usage` event + UI 自己累计
- 仅在任务结束后做汇总展示

### Why Chosen

扩展 snapshot 的方案在当前架构里最一致，能最小化 UI 状态复杂度，并将真实 usage / estimated fallback 封装在 provider 层与 graph state 层。

### Consequences

- `ModelResponse`、`AgentExecutionSnapshot` 和 graph state 都会扩展 usage 相关字段。
- 需要明确 snapshot 的发射时机从“主要跟随 tool observation”扩展为“LLM 成功返回后即可更新 usage 相关 snapshot”。
- 需要新增至少一组 provider usage 测试和一组 snapshot/UI 保留测试。
- 如果 checkpoint 持久化未来也要恢复 token usage 连续性，则需要后续扩展 `SessionCheckpoint` schema 与 store 读写逻辑，但这不作为本轮验收门槛。

### Follow-ups

- 评估是否把 token usage 也纳入 checkpoint 保存内容。
- 评估未来是否需要在 debug 模式下显示调用级 breakdown，但不纳入当前范围。

## Available-Agent-Types Roster

- `executor`
- `architect`
- `test-engineer`
- `debugger`
- `verifier`
- `critic`
- `explore`
- `writer`

## Follow-up Staffing Guidance

### For `$ralph`

- Recommended lanes:
  - `executor` x1, reasoning `high`
    - 负责 `messageTypes -> modelRouter -> agentGraph/reactLoop -> console UI` 主实现
  - `test-engineer` x1, reasoning `medium`
    - 负责补 provider/snapshot/UI 测试与验证命令
  - `architect` x1, reasoning `medium`
    - 负责最终结构校验，重点看是否引入了第二状态通道或破坏 checkpoint/restore

Why:
- 这是中等复杂度的跨层变更，但不是大规模重构；顺序执行加独立测试校验足够稳妥。

### For `$team`

- Recommended staffing:
  - `executor` x2
    - Lane A: provider + graph state 累计
    - Lane B: snapshot + UI header + reducer 契约
  - `test-engineer` x1
    - Lane C: provider fallback / snapshot persistence / UI behavior tests
  - Optional `architect` x1 as leader-side sign-off lane

Suggested reasoning by lane:
- Lane A `high`
- Lane B `medium`
- Lane C `medium`
- Sign-off lane `medium`

Why:
- provider/graph 与 UI/tests 两条线有一定并行性，但共享契约点是 `TokenUsage` 与 `AgentExecutionSnapshot`。

## Launch Hints

### Ralph path

```bash
$ralph .omx/plans/prd-token-usage-ui.md
```

Recommended Ralph brief:
- 先锁 `TokenUsage` / snapshot 契约
- 再做 provider + graph 累计
- 最后接 UI header 与测试

### Team path

```bash
$team 3:executor "Implement token usage accumulation and top-snapshot display using .omx/plans/prd-token-usage-ui.md and .omx/plans/test-spec-token-usage-ui.md"
```

Equivalent OMX launch hint:

```bash
omx team 3:executor "Implement token usage accumulation and top-snapshot display using .omx/plans/prd-token-usage-ui.md and .omx/plans/test-spec-token-usage-ui.md"
```

## Team Verification Path

1. Lane A proves provider 层能输出统一 usage，且 graph state 正确累计。
2. Lane B proves `AgentExecutionSnapshot` 扩展后，`ConsoleHeader` 可持续显示累计 token，且不改日志流。
3. Lane C proves tests 覆盖：
   - 真实 usage
   - estimated fallback
   - mixed-source 语义
   - final-only 回合最终值
   - 新任务开始重置
   - snapshot 保留最终值
4. Leader 在集成后运行：
   - `npm run typecheck`
   - `npm run test`
5. 若团队模式结束后仍有集成或回归修复残留，再单独启动 `$ralph` 做最后单 owner 收尾；否则无需额外 Ralph follow-up。

## Consensus Changelog

- 初版即采用 snapshot 扩展方案，并明确排除独立 usage event 流。
- Architect review applied: 将 checkpoint/restore 的 token usage 连续性降级为显式风险与验证点，而不是首版硬性验收标准。
- Architect review applied: 明确 snapshot 发射时机必须覆盖每次成功的 LLM 调用和 final-only 回合，不能只依赖 tool observation。
- Architect review applied: 将任务级 usage 来源语义从 `actual|estimated` 扩展为允许 `mixed`，避免聚合后误导。
- Critic review applied: 验收标准保持与用户边界一致，聚焦任务级实时展示、最终值保留、真实 usage 优先与 fallback 可用性。
- Critic review applied: 为 integration/checkpoint 测试补充现有挂点，避免执行阶段重新寻找测试入口。
- Critic final pass: APPROVE，无必改项；保留“估算逻辑断言尽量验证不变量而非绑定具体算法常数”作为执行期可选改进。
- 将 UI 展示粒度固定为任务级汇总，推荐 `input / output / total`，但允许执行阶段在不违背边界的前提下做轻量格式调整。
