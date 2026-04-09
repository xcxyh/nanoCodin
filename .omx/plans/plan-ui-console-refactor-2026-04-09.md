# Plan: src/ui 控制台 UI 重构

## Requirements Summary

目标是重构 `src/ui` 下的 CLI UI，使结构和目录边界更合理，并满足以下交互约束：

- `useEffect` 相关逻辑与展示组件分离，不能继续堆在同一个 `consoleApp.tsx` 中。
- 视图分区明确：顶部 `header`，中间消息区，底部 `footer`；输入框位于 `footer` 上方；todo 列表位于输入框上方。
- `footer` 需要展示当前模型名称和累计 token 总数。
- 中间消息区改成接近 Claude Code 的简洁状态流，不再展示 `thinking` 文本。
- todo 列表独立展示，并随执行快照实时更新状态。
- 一轮任务结束时清空过程消息，仅保留“用户输入 + 最终结果消息”；下一轮继续按同样规则保留。

这次不是纯视觉改动，而是一次 UI 架构重组。当前实现的几个核心约束如下：

- `src/ui/consoleApp.tsx:56` 同时承担布局、任务运行、键盘输入、permission prompt、file picker、exit arm 和多个 `useEffect`，职责过宽。
- `src/ui/consoleState.ts:25` 到 `src/ui/consoleState.ts:50` 的状态模型仍然围绕扁平 `logs`、`thinkingVisible`、`loadingVisible`、`pendingToolName` 设计，不适合“按轮次只保留最终结果”的目标。
- `src/ui/consoleState.ts:250` 到 `src/ui/consoleState.ts:312` 仍会显式写入 `thought` / `loading` / `observation` / `final` 日志，结束后只追加完成提示，不会清理过程日志。
- `src/ui/consoleComponents.tsx:129` 到 `src/ui/consoleComponents.tsx:152` 把 header、todo、verification、token、subtask、next action、touched files 全塞在顶部，和目标布局冲突。
- `src/ui/consoleComponents.tsx:157` 只提供一个通用 `ConsoleLogList`，没有 todo 独立分区，也没有 footer 组件。
- `src/agent/reactLoop.ts:30` 到 `src/agent/reactLoop.ts:40` 的 `AgentExecutionSnapshot` 里，`todos` 是预格式化字符串数组，不利于 todo 独立渲染和实时状态展示。
- `src/llm/modelRouter.ts:16` 到 `src/llm/modelRouter.ts:18` 的 `ModelProvider` 接口没有模型元数据；`src/cli/runCli.ts:75` 到 `src/cli/runCli.ts:114` 也没有把模型名传给 UI，因此 footer 目前拿不到模型名称。
- 现有测试主要覆盖 reducer 的旧日志行为和 token 文本格式，见 `tests/unit/consoleState.test.ts:23` 到 `tests/unit/consoleState.test.ts:198` 以及 `tests/unit/consoleComponents.test.ts:4` 到 `tests/unit/consoleComponents.test.ts:39`；没有保护新布局与“按轮次清理过程消息”的行为。

## Recommended Architecture

采用“入口保留、目录下沉、状态重塑、组件分区”的方案，尽量小步改造而不是整套推翻。

建议目标目录：

```text
src/ui/
  consoleApp.tsx                  # 仅做顶层组装，保留现有导出路径
  components/
    ConsoleHeader.tsx
    ConsoleMessagePane.tsx
    ConsoleTodoPane.tsx
    ConsoleInputBar.tsx
    ConsoleFooter.tsx
    PermissionPromptBox.tsx
  hooks/
    useConsoleTaskRunner.ts
    useConsoleKeyboard.ts
    useConsoleBootstrap.ts
    usePermissionPrompt.ts
  state/
    consoleUiReducer.ts
    eventMapper.ts
    transcript.ts
  utils/
    filePicker.ts
    tokenUsage.ts
```

设计原则：

- 保留 `src/ui/consoleApp.tsx` 作为稳定入口，避免影响 `src/cli/runCli.ts:8` 的 import 路径。
- 所有 `useEffect` 迁移到 `hooks/` 下，`consoleApp.tsx` 只做组合和 props 连接。
- 废弃基于扁平 `logs` 的追加式状态，改为“历史消息 + 进行中过程态 + 当前快照”的结构。
- 删除 `thinking_tick`、`thinkingVisible`、`loadingVisible`、`toggle_latest_observation` 这类只为旧日志 UI 服务的状态和交互。
- `todo` 使用结构化数据渲染，不再依赖 `"[x] task"` 这种字符串协议。

## Acceptance Criteria

1. `src/ui/consoleApp.tsx` 不再直接包含多个 `useEffect` 的实现体；副作用逻辑移动到 `src/ui/hooks/` 下。
2. 渲染顺序固定为：`Header -> MessagePane -> TodoPane -> InputBar -> Footer`。
3. 运行中消息区不再显示 `Thinking...` 或来自 `event.type === "thought"` 的文本。
4. 运行中消息区展示精简的过程状态，至少区分用户消息、工具动作/状态、最终结果、错误。
5. todo 列表独立区域可实时展示未完成/已完成状态，且执行中的状态更新来源于 agent snapshot，而不是静态副本。
6. 任务完成后，过程消息会被清空，只保留该轮的用户输入与最终结果消息。
7. 新一轮任务开始时，上一轮的用户输入与最终结果仍可保留，但上一轮过程消息不会残留。
8. footer 显示当前模型名称和当前轮累计 token 总数；没有 token 时显示空态文案，不报错。
9. 模型名称来源明确且稳定，不依赖 UI 层自己猜测 `process.env` 组合逻辑。
10. `npm run typecheck`、`npm run test`、`npm run build` 全部通过。

## Implementation Steps

1. 先补回归测试，锁定真正要保留的新行为
   - 现状证据：
     - `tests/unit/consoleState.test.ts:23` 到 `tests/unit/consoleState.test.ts:198` 只覆盖旧 reducer 行为。
     - `tests/unit/consoleComponents.test.ts:4` 到 `tests/unit/consoleComponents.test.ts:39` 只覆盖 token 格式化。
   - 计划：
     - 新增 reducer/transcript 测试，覆盖“任务完成后只保留 user + final”。
     - 新增 snapshot/todo 映射测试，覆盖 todo 状态实时刷新。
     - 新增 runCli/ConsoleApp props 测试，覆盖模型名进入 UI。
     - 若拆出消息视图模型，给消息区增加最少一组视图层测试，验证 `thought` 被过滤、tool 状态被保留。

2. 重塑 UI state，改掉当前扁平 `logs` 模型
   - 现状证据：
     - `src/ui/consoleState.ts:25` 到 `src/ui/consoleState.ts:35` 的 `UiState` 仍以 `logs` 为中心。
     - `src/ui/consoleState.ts:166` 到 `src/ui/consoleState.ts:362` 的 reducer 是 append-only 思路。
   - 计划：
     - 引入按轮次组织的 transcript，例如：
       - `history: Array<{ user: string; final: string | null; error: string | null }>`
       - `activity: ActivityEntry[]`
       - `latestSnapshot: AgentExecutionSnapshot | null`
     - `task_start` 时创建新的进行中轮次并清空旧 `activity`。
     - `append_action` / `append_observation` 时仅更新当前轮 `activity`。
     - `append_final` / `task_success` 时把当前轮压缩成 `{ user, final }`，并清空 `activity`。
     - `task_failure` / `task_cancel` 明确是否保留 error/cancel 消息；若按产品意图保留最终错误，也应和过程消息分离。

3. 精简事件映射，移除 thinking 风格
   - 现状证据：
     - `src/ui/consoleState.ts:365` 到 `src/ui/consoleState.ts:382` 直接把 `event.type === "thought"` 映射成可见消息。
     - `src/agent/agentGraph.ts:210` 明确持续发出 `thought` event。
   - 计划：
     - 在 `eventMapper.ts` 中忽略 `thought` 事件，或仅把它转成内部状态但不渲染。
     - 把 `action + observation` 组合为简洁的 activity 行，例如“Reading files”, “Running bash”, “Updating todo”。
     - 复用 `src/ui/consoleState.ts:67` 到 `src/ui/consoleState.ts:103` 现有 summary 思路，但把它下沉为消息视图层工具，不再直接暴露整段 observation。
     - 删除与 `Thinking...` 相关的 tick 动画、placeholder 和 Ctrl+E 展开逻辑。

4. 把 todo 从 header 中拿出来，并改为结构化渲染
   - 现状证据：
     - `src/ui/consoleComponents.tsx:142` 到 `src/ui/consoleComponents.tsx:150` 把 todos 和其它状态都堆在 header。
     - `src/agent/reactLoop.ts:198` 到 `src/agent/reactLoop.ts:206` 的 snapshot 输出是预格式化字符串。
   - 计划：
     - 将 `AgentExecutionSnapshot.todos` 从 `string[]` 改为结构化数组，优先复用 `TodoItem` 语义，而不是继续传 `[x]/[ ]` 字符串。
     - `ConsoleTodoPane` 专门渲染 todo，放在输入框上方。
     - todo 为空时保持该区域最小占位，避免布局跳动。
     - 将 `verificationCommands / subtaskSummaries / touchedFiles` 从 header 中移除；如仍需保留，可只在消息区输出简化状态，不再占据顶部。

5. 拆组件目录，重组页面布局
   - 现状证据：
     - `src/ui/consoleComponents.tsx:1` 到 `src/ui/consoleComponents.tsx:224` 同时承载 header、log list、permission prompt、input bar。
     - `src/ui/consoleApp.tsx:362` 到 `src/ui/consoleApp.tsx:370` 目前只有 `Header -> LogList -> Permission -> Input`。
   - 计划：
     - 拆出 5 个独立组件：`ConsoleHeader`、`ConsoleMessagePane`、`ConsoleTodoPane`、`ConsoleInputBar`、`ConsoleFooter`。
     - `PermissionPromptBox` 保持独立，但它属于输入层附件，应位于消息区之后、输入框之前，避免压在 footer 信息位。
     - `consoleApp.tsx` 只保留布局装配和 hook 返回值解构，不再定义具体渲染细节。
     - 统一让 footer 只负责底部状态信息，不混入输入框和 todo。

6. 拆 hooks，把 effect 从视图组件里拿走
   - 现状证据：
     - `src/ui/consoleApp.tsx:148` 到 `src/ui/consoleApp.tsx:168` 包含动画和 exit timeout effect。
     - `src/ui/consoleApp.tsx:331` 到 `src/ui/consoleApp.tsx:348` 包含 bootstrap 和 permission effect。
   - 计划：
     - 删除 thinking/loading 动画 effect，因为新 UI 不再展示 `thinking`。
     - `useConsoleBootstrap` 负责 `initialTask / resumeSessionId` 自动开跑。
     - `usePermissionPrompt` 负责注册/清理 `permissionController.setPromptHandler(...)`。
     - `useConsoleTaskRunner` 负责 `runTask`、abort/cancel、event dispatch。
     - `useConsoleKeyboard` 负责 `useInput`、Ctrl+C、Esc、@ 文件选择，以及任务提交。
     - 退出二次确认逻辑可以拆成 `useExitArm`，也可以并入 `useConsoleKeyboard`，但不要继续留在视图入口。

7. 为 footer 提供模型名和 token 总数
   - 现状证据：
     - `src/ui/tokenUsage.ts:12` 到 `src/ui/tokenUsage.ts:21` 已能格式化 token usage。
     - `src/llm/modelRouter.ts:317` 到 `src/llm/modelRouter.ts:327` 能解析模型名，但没有暴露给 UI。
     - `src/cli/runCli.ts:76` 创建 model 后，只把 `graph` 和 `permissionController` 传给了 `ConsoleApp`。
   - 计划：
     - 在 `src/llm/modelRouter.ts` 中补一个稳定的“当前模型标识解析”导出，例如 `getConfiguredModelNameFromEnv()`，复用现有 provider 分支逻辑，避免 UI 或 CLI 再写一套环境变量推断。
     - `runCli` 把模型名作为显式 prop 传入 `ConsoleApp`。
     - `ConsoleFooter` 只展示两项核心信息：`Model` 与 `Tokens`，其中 token 使用当前轮累计 `latestSnapshot.tokenUsage?.totalTokens`。
     - 若任务尚未启动，footer 仍显示 model，token 显示 `0` 或 `(none)`，保证信息稳定。

8. 清理旧代码而不是做双轨兼容
   - 现状证据：
     - `src/ui/consoleState.ts` 中 `thinking_tick`、`toggle_latest_observation`、ephemeral placeholder 都是旧展示形态的遗留。
     - `src/ui/consoleComponents.tsx` 中 `renderLogEntry()` 为多种旧日志种类做了分支。
   - 计划：
     - 直接删除 `thought`/`loading` placeholder 相关 state 和 helper。
     - 删除 `Ctrl+E` 展开最新输出的提示和快捷键说明；如仍需展开能力，应作为后续独立需求。
     - 若 `consoleComponents.tsx` 完全拆空，直接删除该文件，避免留下新的“垃圾集散地”。
     - 尽量让 `src/ui/tokenUsage.ts`、`src/ui/filePicker.ts` 继续复用，减少无效搬运。

## Risks And Mitigations

1. 风险：只改组件拆分，不改状态模型，会导致“任务结束后只留 user + final”无法自然实现。
   - 缓解：把这次重构的核心放在 transcript/state 重塑，而不是只改文件夹。

2. 风险：继续使用预格式化 `snapshot.todos: string[]` 会让 todo 面板被迫解析字符串协议。
   - 缓解：同步调整 `AgentExecutionSnapshot` 为结构化 todo 数据；这是合理的架构边界修复。

3. 风险：模型名如果直接在 UI 内部读 `process.env`，会和 `createModelProviderFromEnv()` 的逻辑漂移。
   - 缓解：模型名解析必须由 `src/llm/modelRouter.ts` 或紧邻 CLI 的 helper 统一提供。

4. 风险：为了保留旧日志能力而做双轨兼容，会把 reducer 复杂度进一步推高。
   - 缓解：以删除为主，明确放弃 `thinking` 和 observation 展开这条旧路径。

5. 风险：todo/消息/最终结果都依赖 `state` event 时序，若 reducer 设计不清楚，容易出现完成后仍残留过程消息。
   - 缓解：在 reducer 测试中把“完成后清空 activity”设为硬性断言。

## Verification Steps

1. `npm run typecheck`
   - 验证新的 UI state、snapshot、ConsoleApp props、模型名传递链路都通过类型检查。

2. `npm run test`
   - 验证 reducer/transcript、todo 展示映射、模型名传入、token footer 显示等行为。

3. `npm run build`
   - 验证 Ink 组件拆分后整体构建仍正常。

4. 手动运行一轮 CLI 任务
   - 确认顶部只有 header。
   - 确认中间消息区不再出现 `Thinking...`。
   - 确认 todo 在输入框上方独立展示并实时变化。
   - 确认 footer 展示模型名和累计 token。
   - 确认任务结束后，仅剩用户输入和最终结果。

## Suggested Execution Order

1. 补测试，先定义新行为。
2. 重构 snapshot/todo 数据形状。
3. 重构 reducer/transcript。
4. 拆 hooks，移出 effects。
5. 拆组件并重组布局。
6. 接入 footer model/token 信息。
7. 删除旧 `thinking` / `loading` / `toggle` 逻辑。
8. 跑 typecheck、test、build，再做手动验证。

