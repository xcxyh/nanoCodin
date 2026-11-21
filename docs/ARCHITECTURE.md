# 跟读一次 NanoCodin 任务

先运行 `node --import tsx examples/custom-agent.ts`。示例会打印 `2 + 3 = 5`。第一轮模型选择 `add`，工具返回 `5`，第二轮模型根据工具结果回答。示例在内存中运行，读完这两轮就可以沿同一条路径理解终端版。

## 模块与入口

| 代码 | 负责什么 |
| --- | --- |
| [api.ts](../src/api.ts)、[agent/run.ts](../src/agent/run.ts) | 嵌入入口与唯一的任务循环。每轮请求模型，执行工具或结束。 |
| [agent/model.ts](../src/agent/model.ts)、[agent/history.ts](../src/agent/history.ts) | 将模型响应统一为工具调用、完成、纠错三种动作。每轮选一次历史证据，内置适配器按需取原生消息或文本消息。 |
| [agent/tools.ts](../src/agent/tools.ts)、[agent/session.ts](../src/agent/session.ts) | 工具注册与输入校验、记录开始与结果、隔离观察者和处理保存失败。 |
| [coding/verification.ts](../src/coding/verification.ts) | 从当前任务的事件推导改动、检查结果与计划。完成回调、模型提示和 UI 使用相同规则。 |
| [coding/instructions.ts](../src/coding/instructions.ts)、[context/](../src/context)、[templates/](../src/templates) | 读取项目规则与显式调用的 skill，按模板优先级生成本次任务的指令。 |
| [model/](../src/model) | 选择供应商，编码工具协议和回退消息，执行带超时、取消与有限重试的请求。 |
| [tools/](../src/tools) | 内置文件编辑、搜索、命令审批、子进程与交互工具。修改文件后通过工具结果报告实际改动。 |
| [session/](../src/session) | 保存、续接和回顾本地会话。 |
| [cli/runCli.ts](../src/cli/runCli.ts)、[config/](../src/config)、[ui/](../src/ui) | 解析参数与配置，装配终端应用，映射退出码。Ink 接收同一套事件，维护输入草稿、审批框与实时输出。 |

## 例子：修复一个参数解析问题

1. 运行 `nano-codin --print '修复 --prompt=x=y 被截断的问题，并运行相关测试'`。CLI 解析一次参数，加载配置，装配模型、工具、验证回调与文件存储。嵌入者可自己提供这些依赖。
2. `run()` 记录用户请求，每项任务开始时生成指令。每轮根据当前会话选择历史，记录模型请求的开始和结果。模型协议层负责续接字段和回退，工具执行始终由主循环触发。
3. 模型选择 `view` 阅读代码，再用 `str_replace` 修改文件。每个工具调用先记录 `tool_start`，再执行并记录 `tool_end`。批量调用按顺序执行。输出中的错误会进入下一轮。
4. 模型调用 `bash` 运行相关测试。coding 工作流记录检查的退出码；下一次修改会使之前的检查失效。用户发起新任务时清空当前任务的验收条件，续接时继续沿用。
5. 模型给出完成动作。还有待验证的改动时，完成回调给出具体原因，循环继续。通过后写入 `finish`。打印模式输出最终答复。完成、错误、未完成、取消分别返回 0、1、2、130。

## 保存与恢复

工作区的 `sessions/<id>.json` 是版本 1 基础快照。CLI 为每次运行独占创建一个编号日志段，存入同目录的 `<id>.journal/`。每个事件占一行 JSON。开始和结束时更新 `latest`。备份时同时复制基础快照和对应日志目录。

`--resume` 读取基础快照与日志中的完整行，再从新的日志段续接。崩溃留下的末尾半行可以跳过。完整行损坏会报告读取错误。仅有开始记录的写操作保留为待核对的副作用。活跃写者和过时的起始历史会触发冲突，竞争者在执行工具前停止。CLI 的写者检查针对同一台机器的本地会话目录。

使用公开 `save(session)` 回调的程序仍会收到完整快照。`FileSessionStore.load()` 和 `loadResult()` 返回合并后的历史。UI 的滚动输出使用 `onProgress`，最终执行结果通过 `tool_end` 持久化。
