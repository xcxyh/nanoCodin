# Test Spec: Task-Level Token Usage UI

## Scope

验证任务级 token usage 从 provider 到顶部状态区的完整链路，覆盖真实 usage、estimated fallback、实时累计和最终值保留。

## Test Matrix

### Unit

1. `ModelResponse` / usage 归一化
   - 目标文件：
     - `src/core/messageTypes.ts`
     - `src/llm/modelRouter.ts`
   - 断言：
     - 真实 usage 能映射为统一结构
     - usage 缺失时返回 `estimated` 结构
     - 同一任务混合真实值与估算值时，聚合来源可表达为 `mixed`
     - `totalTokens` 与 `promptTokens + completionTokens` 一致

2. `AgentExecutionSnapshot` 扩展
   - 目标文件：
     - `src/agent/reactLoop.ts`
   - 断言：
     - snapshot builder 能输出 token usage
     - usage 为空时格式安全

3. `uiReducer` 保留 snapshot token usage
   - 目标文件：
     - `src/ui/consoleState.ts`
     - `tests/unit/consoleState.test.ts`
   - 断言：
     - `set_snapshot` 后 `latestSnapshot` 带上 token usage
     - `task_success` / `task_failure` / `task_cancel` 不会清掉最后一次 snapshot usage
     - 新任务开始时，不会把上一任务 token 伪装成新任务累计值

4. `ConsoleHeader` 渲染
   - 目标文件：
     - `src/ui/consoleComponents.tsx`
   - 断言：
     - usage 存在时渲染 token 行
     - estimated / mixed 路径有轻量来源标记
     - 不影响其他 header 行

### Integration

1. graph 在多次 `model.generate(...)` 后能累计任务级 token
   - 目标文件：
     - `src/agent/agentGraph.ts`
     - 可基于现有入口扩展：`tests/integration/agentGraphVerify.test.ts:57`
   - 断言：
     - 两次生成的 usage 能正确累加到一次任务 snapshot
     - 最后一个回合直接 `final` 时，最终累计值仍会进入 snapshot / header 路径

2. restore checkpoint 兼容性检查
   - 前提：
     - 若本次实现顺手扩展 checkpoint 内容，则新增对应测试
     - 若本次不扩展 checkpoint，则至少验证 restore 路径不会因为新增 usage 字段而崩溃，并在结论中记录 gap
   - 现有挂点：
     - `tests/unit/sessionCheckpoint.test.ts:28`
     - `src/services/sessionCheckpoint.ts:43`
     - `src/services/sessionCheckpoint.ts:104`

### Manual

1. 运行一个最小 task
   - 观察顶部状态区在执行中出现 token usage
2. 确认任务结束后 token 仍可见
3. 确认启动下一次任务时不会继续显示上一任务累计值
4. 确认日志流没有新增 token usage 输出

## Acceptance Criteria Mapping

1. 实时刷新
   - Unit: snapshot/update path
   - Integration: graph accumulate
   - Manual: top header visibly updates

2. 任务结束后保留最终值
   - Unit: `task_success` / `task_failure` / `task_cancel`
   - Integration: final-only path still updates snapshot
   - Manual: task complete view

3. 真实 usage 优先
   - Unit: provider normalization

4. usage 缺失时估算
   - Unit: fallback behavior
   - Unit/Integration: mixed-source aggregate behavior

5. 不显示调用级明细
   - Manual: no detail list
   - Review: no new log event type for usage

6. 不污染日志流
   - Unit/Review: `consoleState` log actions unchanged for usage
   - Manual: logs remain unchanged

## Verification Commands

```bash
npm run typecheck
npm run test
```

## Known Gaps To Close During Execution

1. 当前仓库里未见现成的 modelRouter 单测，执行阶段需要决定是新建 provider-focused unit test，还是通过 graph/integration 测试覆盖。
2. 如果 checkpoint 需要持久化 usage，需补对应测试；如果本轮不做，需要在实现结论里明确记录为 follow-up，并至少保留 restore 兼容性验证。
3. 若执行阶段选择在 `task_start` 直接清空 `latestSnapshot`，需要确认这不会回归现有 header 行为；若选择发出新任务初始 snapshot，则需要测试该时序。
