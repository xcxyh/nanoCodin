# Deep Interview Spec: Token Usage UI

## Metadata

- Profile: `standard`
- Rounds: `7`
- Final ambiguity: `13%`
- Threshold: `20%`
- Context type: `brownfield`
- Context snapshot: `.omx/context/token-usage-ui-20260405T021044Z.md`
- Transcript: `.omx/interviews/token-usage-ui-20260405T021044Z.md`

## Clarity breakdown

| Dimension | Score |
| --- | --- |
| Intent | 0.78 |
| Outcome | 0.94 |
| Scope | 0.94 |
| Constraints | 0.78 |
| Success | 0.92 |
| Context | 0.90 |

## Intent

让用户在现有终端 UI 中直观看到一次完整 agent 任务的 token 消耗，并且在运行过程中持续可见，以便理解成本与执行开销。

## Desired Outcome

在现有顶部状态区增加一个 token usage 展示区域，随着任务执行实时刷新累计 token；任务结束后保留本次任务的最终累计值。

## In Scope

- 为单次完整任务建立 token usage 累计模型
- 在 agent 运行过程中持续更新累计值
- 在顶部状态区展示 token 使用情况
- 优先使用 provider 返回的真实 usage
- 当真实 usage 缺失时回退到本地估算
- 为相关状态流转与 UI 渲染补测试

## Out of Scope / Non-goals

- 不展示每次 LLM 调用的明细列表
- 不在日志流中插入 token usage 输出
- 不改变现有日志区的职责和交互方式
- 不要求首版必须把 provider 级 usage 精确到所有平台都完全一致

## Decision Boundaries

- 允许实现自行决定顶部状态区的字段粒度：
  - `Tokens: total`
  - 或 `Tokens: input / output / total`
- 但不允许引入调用级明细列表，也不改日志流展示模式

## Constraints

- 保持现有 CLI 行为整体稳定
- 遵循现有 TypeScript + ESM 模式
- 优先小而可 review 的改动
- 优先真实 usage，拿不到时允许估算，不能因为缺失真实 usage 就让 UI 空白或报错

## Testable acceptance criteria

1. agent 运行期间，顶部状态区能实时刷新本次任务的累计 token。
2. 任务结束后，顶部状态区保留本次任务的最终累计 token。
3. 当 provider 返回真实 usage 时，展示基于真实 usage 的累计值。
4. 当真实 usage 不可得时，系统回退到本地估算，UI 仍显示可用 token 值。
5. 不新增每次 LLM 调用的明细展示。
6. 不在日志流中新增 token usage 输出。

## Assumptions Exposed + Resolutions

- 假设 1: 用户只需要任务结束后的 token 汇总。
  - Resolution: 错。用户要求运行时实时展示。
- 假设 2: token usage 可能应该展示在日志流。
  - Resolution: 错。用户明确要求放在顶部状态区持续刷新。
- 假设 3: 顶部展示可能需要调用级明细。
  - Resolution: 错。用户明确只要任务级实时累计，不要每次调用明细。

## Pressure-pass findings

关键反转点出现在“任务结束汇总”与“运行时实时展示”的区分。实现必须支持运行中累计更新，因此需要把 usage 数据纳入 agent 执行态并驱动 snapshot 刷新。

## Brownfield evidence vs inference

### Evidence

- `ModelResponse` 当前未承载 usage 元数据
- LLM provider 层当前未向上返回 usage
- UI 顶部状态区已有快照刷新机制，可作为 token usage 的展示承载点

### Inference

- 实现大概率需要穿过 `modelRouter -> agentGraph/reactLoop -> consoleState/consoleComponents` 这条链路
- 若使用 `generateText(...)` 的 usage 元数据，需要按 AI SDK 当前返回结构做适配；若缺失则需要项目内估算策略

## Technical context findings

- 相关文件很可能包括：
  - `src/core/messageTypes.ts`
  - `src/llm/modelRouter.ts`
  - `src/agent/reactLoop.ts`
  - `src/agent/agentGraph.ts`
  - `src/ui/consoleState.ts`
  - `src/ui/consoleComponents.tsx`
  - `tests/unit/consoleState.test.ts`

## Recommended handoff

- Recommended: `$ralplan`
- Why: 需求已清晰，但实现会跨越 provider、agent 状态和 UI 三层，先做一次结构化 plan 更稳妥。
