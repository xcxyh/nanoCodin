# Plan: AI SDK Structured Tool Calling

## Requirements Summary

- 用 AI SDK 的 structured tool calling 改造当前纯文本 ReAct 工具调用，降低 LLM 输出非法 `Action Input`、错字段、错工具名的概率。
- 保持 nano-codin 简洁：不引入新依赖，不把工具执行交给 AI SDK，不绕过现有 `ToolRegistry`、permission、phase gate、checkpoint、recovery、UI event。
- 保留当前 agent loop 的外部行为：`CodingAgentGraph.run()` 仍返回 `{ finalAnswer, steps }`，CLI/UI 不需要改调用方式。
- 保留纯文本 ReAct fallback，避免不支持 tool calling 的 provider/baseURL 直接不可用。

## Current Code Facts

- [modelRouter.ts](/Users/xiongmac/code/nanoCodin/src/llm/modelRouter.ts):10 定义 `ModelProvider.generate(messages, options)`，目前只能返回 `ModelResponse` 纯文本。
- [messageTypes.ts](/Users/xiongmac/code/nanoCodin/src/core/messageTypes.ts):30 的 `ModelResponse` 目前只有 `text` 和 `usage`。
- [modelRouter.ts](/Users/xiongmac/code/nanoCodin/src/llm/modelRouter.ts):140 和 [modelRouter.ts](/Users/xiongmac/code/nanoCodin/src/llm/modelRouter.ts):175 把 messages 拼成 `prompt` 后调用 `generateText({ model, prompt })`，没有传 `tools`。
- [agentGraph.ts](/Users/xiongmac/code/nanoCodin/src/agent/agentGraph.ts):196 用 `parseAgentResponse(responseText)` 从文本中解析 `Thought/Action/Action Input`。
- [registry.ts](/Users/xiongmac/code/nanoCodin/src/tools/registry.ts):73 当前 prompt 只输出 `tool.name: tool.description`，不输出 schema。
- [toolTypes.ts](/Users/xiongmac/code/nanoCodin/src/core/toolTypes.ts):155 每个工具已经持有 Zod schema，可直接转换成 AI SDK tool `parameters`。
- 本地 `ai` 包是 4.3.19；[index.d.ts](/Users/xiongmac/code/nanoCodin/node_modules/ai/dist/index.d.ts):904 的 `Tool` 使用 `parameters` 描述输入 schema，且 `execute` 可选。
- [index.d.ts](/Users/xiongmac/code/nanoCodin/node_modules/ai/dist/index.d.ts):2471 的 `generateText()` 支持 `tools`、`toolChoice`、`maxSteps`、`experimental_repairToolCall`。
- [index.d.ts](/Users/xiongmac/code/nanoCodin/node_modules/ai/dist/index.d.ts):51 的 `ToolChoice` 支持 `"auto"`、`"required"`、`"none"` 和指定 tool。

## Recommended Architecture

选择“AI SDK 负责结构化选择工具，nano-codin 负责执行工具”。

- 在 `ModelProvider.generate()` 中传入 AI SDK `tools`，但不提供 AI SDK tool `execute` 函数。
- AI SDK 返回 `result.toolCalls[0]` 后，把它映射成现有 `ToolCall { name, input }`。
- `CodingAgentGraph.agentNode()` 优先使用 `response.toolCall`，只有没有 structured tool call 时才 fallback 到 `parseAgentResponse(response.text)`。
- 增加一个 synthetic `final` tool，参数为 `{ answer: string }`，让最终回答也走 structured output。
- 使用 `toolChoice: "required"` 作为默认 structured 模式，让每一步必须选择一个 real tool 或 `final`；保留 env/config fallback 走旧文本 ReAct。
- 保持 `ToolRegistry.execute()` 是唯一真实工具执行入口，这样现有 permission、schema validation、phase gate、checkpoint、session memory、recovery 都不变。

## Rejected Options

- 让 AI SDK tool `execute` 直接调用 `ToolRegistry.execute()`：拒绝。它会把工具执行移动到 provider 层，难以复用 `agentGraph.ts` 里的 phase gate、event emission、checkpoint、recovery、step history。
- 只使用 `generateObject()` 输出 `{ action, input }`：拒绝。它能结构化输出，但没有利用 provider 原生 tool calling，也不能让模型用工具 schema 做选择。
- 删除 `parseAgentResponse()`：暂不做。兼容不支持 tool calling 的 provider/baseURL，并保留现有测试与降级路径。

## Implementation Steps

1. 扩展核心类型。
   - 在 [messageTypes.ts](/Users/xiongmac/code/nanoCodin/src/core/messageTypes.ts) 的 `ModelResponse` 增加可选字段：
     - `toolCall?: ToolCall`
     - `finishReason?: string`
     - `structured?: boolean`
   - 不改变 `AgentStep` 和 `ToolCall` 形状，减少下游改动。

2. 给 `ModelProvider.generate()` 增加可选工具参数。
   - 在 [modelRouter.ts](/Users/xiongmac/code/nanoCodin/src/llm/modelRouter.ts) 扩展 `ModelGenerateOptions`：
     - `tools?: ToolRegistry`
     - `toolChoice?: "auto" | "required" | "none"`
     - `structuredToolCalling?: boolean`
   - 默认值建议：`structuredToolCalling=true`，`toolChoice="required"`。
   - 用 env 或 runtime config 留开关，例如 `NANOCODIN_TEXT_REACT=1` 或 config flag，便于兼容不支持 tools 的 endpoint。

3. 增加 AI SDK tool adapter。
   - 新建 `src/llm/aiSdkTools.ts`。
   - 输入 `ToolRegistry`，输出 AI SDK `ToolSet`。
   - 对每个 nano tool 映射：
     - key = `tool.name`
     - `description = tool.description`
     - `parameters = tool.schema`
     - 不设置 `execute`
   - 添加 synthetic `final` tool：
     - description: `Return the final answer when the task is complete`
     - parameters: `z.object({ answer: z.string().min(1) })`
   - 注意不要把 `final` 注册进 `ToolRegistry`；它只存在于 LLM 选择层。

4. 改造 provider 调用。
   - 在 OpenAI/Anthropic provider 中保留现有 `prompt` 生成方式，先用最小改动：
     - `system = messages.find(role === "system")?.content`
     - `prompt = messages.filter(role !== "system").map(...).join(...)`
   - structured 模式调用 `generateText({ model, system, prompt, tools, toolChoice, maxSteps: 1, abortSignal, experimental_repairToolCall })`。
   - 若 `result.toolCalls[0]` 存在：
     - 如果 `toolName === "final"`，返回 `text` 为现有 ReAct final 文本或直接返回 `toolCall: { name: "final", input: args }`。
     - 否则返回 `toolCall: { name: toolName, input: args }`。
   - 若 provider 抛出“不支持 tool calling / no such tool / tool call unsupported”一类错误：
     - fallback 到现有 `generateText({ prompt })`。
     - 返回 `structured: false`，让 agent 继续走文本 parser。

5. 改造 agent loop 选择逻辑。
   - 在 [agentGraph.ts](/Users/xiongmac/code/nanoCodin/src/agent/agentGraph.ts) 调用 `this.model.generate(messages, { abortSignal, tools: this.tools, toolChoice: "required" })`。
   - 如果 `response.toolCall` 存在：
     - `parsed.thought` 可以用 `response.text || "Selected structured tool call."`。
     - `parsed.action = response.toolCall.name`。
     - `parsed.actionInput = response.toolCall.input`，并保证是 `Record<string, unknown>`。
   - 如果不存在，保留 `parseAgentResponse(response.text)`。
   - 现有 final guard、phase inference、planner hint、tool execution、recovery 逻辑保持不变。

6. 更新 prompt。
   - [system.hbs](/Users/xiongmac/code/nanoCodin/src/prompts/system.hbs) 改为强调：
     - structured tool calling 可用时直接选择工具；
     - 只有 fallback 文本模式才输出 `Thought/Action/Action Input`。
   - [react.hbs](/Users/xiongmac/code/nanoCodin/src/prompts/react.hbs) 保持简洁，不再强依赖文本格式。
   - `formatToolsForPrompt()` 可保留描述，作为 fallback 和 model guidance；无需把完整 schema 塞入 prompt，因为 structured mode 已通过 AI SDK 传 schema。

7. 增加测试。
   - [tests/unit/modelRouter.test.ts](/Users/xiongmac/code/nanoCodin/tests/unit/modelRouter.test.ts)：增加 provider adapter 单元测试，验证 `toolCalls[0]` 映射成 `ModelResponse.toolCall`。
   - [tests/unit/reactLoop.test.ts](/Users/xiongmac/code/nanoCodin/tests/unit/reactLoop.test.ts)：保留旧 parser 测试，确保 fallback 不退化。
   - [tests/integration/agentGraphVerify.test.ts](/Users/xiongmac/code/nanoCodin/tests/integration/agentGraphVerify.test.ts)：增加 fake structured model：
     - 第一次返回 `toolCall: create`，第二次返回 `toolCall: final`。
     - 断言仍经过 `ToolRegistry.execute()`，step history、final summary、token usage、verification guard 不变。
   - 新增 `tests/unit/aiSdkTools.test.ts`：
     - 工具 schemas 被映射到 AI SDK `parameters`。
     - synthetic `final` tool 存在。
     - adapter 不包含 `execute`。

8. 更新文档。
   - README/README.zh-CN 的 Highlight 增加“AI SDK structured tool calling for tool selection”。
   - 配置章节说明 fallback env/config（如果实现了开关）。
   - CHANGELOG Unreleased 增加变更项。

## Acceptance Criteria

- structured mode 下，模型选择工具不再依赖 `Action Input:` 文本解析。
- `ToolRegistry.execute()` 仍是唯一实际工具执行入口。
- `final` 可通过 synthetic structured tool 返回，并仍受 verification guard 约束。
- 不支持 tool calling 的 provider/baseURL 能自动 fallback 到现有文本 ReAct。
- 现有 CLI/UI 调用面不变。
- 不新增依赖；复用当前 `ai`、Zod 和工具 registry。
- `npm run typecheck` 通过。
- `npm run test` 通过。
- `npm run build` 通过。

## Risks and Mitigations

- Risk: 某些 OpenAI-compatible endpoint 宣称兼容但不支持 tools。
  Mitigation: 保留文本 ReAct fallback，并加 env/config 开关强制旧模式。
- Risk: `toolChoice: "required"` 可能导致模型过早选择工具而不是自然回答。
  Mitigation: synthetic `final` tool 作为合法完成路径；若实践中过度调用工具，可改为 `"auto"` 并在 prompt 中强调完成时调用 `final`。
- Risk: AI SDK 多步 tool execution 与 nano agent loop 双重循环冲突。
  Mitigation: 设置 `maxSteps: 1`，adapter 不提供 `execute`，不让 AI SDK 自动进入 tool-result step。
- Risk: structured mode 没有原来 `Thought` 文本。
  Mitigation: `AgentStep.thought` 使用 `response.text || response.reasoning || "Selected structured tool call."`，UI 仍能展示有意义状态。
- Risk: synthetic `final` 名称与真实工具重名。
  Mitigation: adapter 构建时检测 registry 是否已有 `final`，若冲突则抛出启动错误或使用内部保留名。

## Verification Steps

- `npm run test -- tests/unit/modelRouter.test.ts tests/unit/reactLoop.test.ts tests/integration/agentGraphVerify.test.ts`
- `npm run test -- tests/unit/aiSdkTools.test.ts`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- 手动/fixture 验证两条路径：
  - structured model 返回 `toolCall`。
  - fallback text model 返回 `Thought/Action/Action Input`。

## Suggested Execution Handoff

- 推荐下一步：`$ralph .omx/plans/plan-ai-sdk-tool-calling.md`
- 推荐单 owner：`executor` 实现 `modelRouter`、adapter、agentGraph 流程和测试。
- 如用 `$team`，最多拆两 lane：
  - executor lane: `src/llm/*`, `src/agent/agentGraph.ts`
  - test/writer lane: tests + README/CHANGELOG
