# Nano Codin

一个可以读懂、修改、嵌入自己程序的 TypeScript coding-agent Harness，也提供终端 CLI。

[English](./README.md) · [功能取舍与重构方案](./docs/REFACTOR.md)

## 核心能力

- 一个普通异步执行循环；没有 Graph、阶段门禁或多层递归预算。
- 注入自己的模型、工具、指令、提问回调、事件监听和会话存储。
- 工具 schema 校验；失败反馈给模型纠正；批量调用按顺序执行。
- OpenAI / Anthropic 兼容适配器；不支持工具协议的接口可回退到带参数 schema 的文本调用。
- 默认 coding 工具、项目规则、skills、命令审批和可取消的终端界面。
- 可选会话保存与恢复；默认结果简短，详细记录按需查看。

特色体现在可定制边界：导入核心不会加载 Ink、模型 SDK、shell 工具或用户配置。内置模型和工具均由使用者显式选择。coding 验证规则是可替换的完成回调。

## CLI

需要 Node.js 20.5+。

```bash
npm install -g nano-codin
nano-codin
nano-codin "修复测试失败"
nano-codin --print --prompt "分析 src/index.ts"
nano-codin --resume
nano-codin --review
```

首次在终端运行会引导配置模型；也可用环境变量配置：

```bash
export MODEL_PROVIDER=openai
export MODEL_NAME=your-model
export MODEL_API_KEY=your-key
# 可选：MODEL_BASE_URL=https://your-compatible-endpoint/v1
nano-codin
```

配置文件是 `~/.nanocodin/config.yaml`，优先级：CLI > 环境变量 > YAML > 默认值。

```yaml
model:
  provider: openai
  name: your-model
  apiKey: your-key
  requestTimeoutMs: 600000
  idleTimeoutMs: 120000
  maxRetries: 1
agent:
  maxSteps: 50
  maxHistoryChars: 48000
sandbox:
  defaultPolicy: ask
  timeoutMs: 60000
```

模型总预算包括重试与兼容回退；收到响应字节会重置无数据计时，不会重置总预算。CLI 可用 `--model-timeout-ms`、`--model-idle-timeout-ms`、`--model-max-retries` 覆盖，也支持 `MODEL_REQUEST_TIMEOUT_MS`、`MODEL_IDLE_TIMEOUT_MS`、`MODEL_MAX_RETRIES`。认证和 schema 错误不自动重试，用户取消会停止重试；超时后会保留会话并给出续接方式，不重放写工具。

`maxSteps` 是每次任务的模型请求轮数；`maxHistoryChars` 限制送入模型的工具历史，磁盘记录保留完整事件。它不是总上下文 token 上限，用户请求、规则和显式调用的 skill 正文另计。

- `--cwd <path>`：选择工作区。
- `--prompt <text>`：提供任务，也支持位置参数。
- `--print`：无 TUI 单次执行，只向 stdout 输出最终答复。非交互环境自动使用此模式。
- `--resume [id]`：加载最近或指定的新格式会话并继续。
- `--review [id]`：只读查看本地会话结果与命令记录，不调用模型。
- `--new-session`：从新会话开始；默认每次启动都是新会话。
- `--max-steps <n>`、`--sandbox-policy <allow|ask|deny>`、`--sandbox-timeout-ms <n>`：临时覆盖配置。
- `--print-config`、`--help`、`--version`：查看配置、帮助和版本。

交互中，`@` 选择文件，`/` 选择内置命令或 skill；↑↓ 导航、Enter 插入，再次 Enter 提交。Esc 先关闭选择器，任务执行中则取消。Ctrl+C 在任务运行时取消，空闲时连续按两次退出；`/clear` 新建会话，`/quit` 退出。保留边框输入区、任务进度、权限高亮、模型与 token 状态栏。

运行结束后执行记录自动收起，历史仍保存在会话中。`Ctrl+O` 重新展开执行记录和详情，↑↓ 选择操作、←→ 翻页；收起后继续编辑原输入。详情中可查看已保存的参数和结果；长行按终端宽度分段，超长内容会标明截断。审批和提问优先，运行中 Esc / Ctrl+C 仍取消任务。

模型请求显示真实的等待状态、轮次和已等待时长；命令执行期间显示有界的 stdout/stderr 尾部。操作耗时包含审批等待，旧会话中未结束的操作显示为“上次中断 · 待核对”。todo 只显示完成项数，不作为整体任务进度。界面不展示模型原始思考文本。

无界面模式的退出码：完成 `0`、执行错误 `1`、未完成 `2`、取消 `130`。无交互回调时，需要审批的命令会明确失败，不会自动批准。`sandbox` 是命令策略检查，不是操作系统隔离环境。

## 嵌入自己的程序

```ts
import { z } from "zod";
import { createAgent, defineTool } from "nano-codin";
import { createModelProvider } from "nano-codin/models";

const add = defineTool({
  name: "add",
  description: "计算两个数的和",
  schema: z.object({ a: z.number(), b: z.number() }),
  async execute({ a, b }) {
    return { ok: true, output: String(a + b) };
  }
});

const agent = createAgent({
  model: createModelProvider({
    provider: "openai", name: "your-model",
    apiKey: process.env.MODEL_API_KEY!, baseUrl: null
  }),
  tools: [add],
  instructions: "使用 add 工具计算，简短回答。"
});

const result = await agent.run("计算 2 + 3", {
  onEvent(event) { /* 接入自己的 UI 或日志 */ }
});
console.log(result.answer);
```

也可以完全替换 `model`，只需实现 `generate(messages, options)`。无需 API Key 的完整示例见 [examples/custom-agent.ts](./examples/custom-agent.ts)：

```bash
npm install
node --import tsx examples/custom-agent.ts
```

扩展接口：

| 接口 | 用途 |
| --- | --- |
| `model` | 自定义模型请求及响应；工具结果执行由 Harness 负责 |
| `tools` / `defineTool` | schema、描述、执行函数；工具上下文只有 cwd、sessionId、signal、ask |
| `instructions` | 字符串或每次任务生成指令的异步函数 |
| `beforeFinish(session)` | 返回原因则继续工作；不传就没有 coding 专用门禁 |
| `ask(request, signal)` | 接入自己的权限与提问 UI；应响应取消信号 |
| `save(session)` | 可选存储回调；失败会显式记录并通过返回值报告 |
| `run(..., { onEvent, signal })` | 订阅执行事实，取消当前运行 |

`run(..., { onProgress })` 可接收 `{ at, callId, stream, text }` 实时输出，`text` 是该流最新的有界尾部快照，不是追加增量。自定义工具通过可选 `context.onOutput({ stream, text })` 提供相同快照。实时数据不进入会话文件或模型上下文；`tool_end` 才是最终结果。`model_start` / `model_end` 是会话事实，记录请求生命周期；观察回调失败不会中断任务。

默认工具：`ls`、`grep`、`view`、`create`、`str_replace`、`bash`、`todo`、`ask_user_question`。使用 `nano-codin/tools` 的 `createDefaultTools()` 获取，也可逐个选择或完全替换。`final` 是保留的完成协议名。

`create` 仅新建文件。已有文件可用原有 `str_replace` 精确替换；整文件改写需先 `view` 取得 SHA256，再传 `{ mode: "rewrite", path, expectedHash, newText }`。旧参数仍有效。改写使用版本检查和同目录原子替换；拒绝编辑符号链接/硬链接/特殊文件，保留权限位。它降低陈旧覆盖风险，不对不合作的并发写者承诺严格 CAS。文本读写上限 8 MiB；大输出按实际行/列返回续读位置。

工具通过 `ToolResult.effects` 声明实际改动、计划或命令验证事实。已知前置失败返回 `changed=false`；可能存在副作用的失败/脚本返回 `uncertainChanges=true`，不伪装成已修改文件。任意 shell 脚本的副作用无法完整推断；需要精确的只读操作时优先使用专用工具。默认 coding CLI 使用 `requireVerification` 完成回调，要求最新改动后有成功检查；自定义工具与 shell 修改应准确声明这些事实。该机制不推断任意 shell 脚本的所有文件改动，也不能证明测试覆盖了业务需求。

同一 Agent 的普通 `run()` 开始新的任务验收；`run(task, { continuation: true })` 延续原任务的计划和检查要求。CLI 的 `continue` / `继续` 和 `--resume` 使用续接语义。新任务不继承旧任务的验收状态，review 仍保留整个会话的改动记录。

默认 bash 验收只接受独立、无修改的单条命令。请分别执行修改和检查；复合命令、管道以及检查后再修改不算验收通过。默认审批策略下，`find`、`sed`、`awk`、`tree` 等可写入或执行其他程序的工具需要确认；显式 `allow` 策略仍可放行。取消和超时会清理 shell 子进程，并保留已经捕获的输出。恢复未结束的写操作后，需要重新运行检查，不会自动重放写入。

原生工具协议按事实顺序构建 assistant/tool 消息；文本回退独立处理。部分服务（如 DeepSeek thinking 工具调用）要求回传协议续接字段，这些数据可保留在私有会话中，但不会显示为思考过程或加入普通文本工具历史；过大或旧会话缺失时降级为明确的历史事实，不执行旧调用。`RunResult.failure` 和模型结束事件可提供分类、尝试次数、耗时、HTTP 状态及响应字节摘要。失败调用没有返回的 usage 不视为零费用。

`nano-codin/session` 提供 `FileSessionStore`（`loadResult()` 区分不存在、损坏、版本和读取错误，`load()` 保留可空返回兼容）；`nano-codin/context` 提供 `loadProjectInstructions` 和 skill 发现函数。它们都是可选适配器。

## 用 Handlebars 定制 prompt

核心仍然只接收最终的 `instructions`，不会导入 Handlebars。可选适配器通过独立入口使用：

```ts
import { createTemplateInstructions } from "nano-codin/templates";
import { loadProjectContext } from "nano-codin/context";

const instructions = createTemplateInstructions({
  file: "./prompts/system.hbs",
  data: (task, session) => loadProjectContext(process.cwd(), task, session)
});
// createAgent({ model, tools, instructions })
```

CLI 模板优先级：项目 `.nanocodin/prompts/system.hbs` > `~/.nanocodin/prompts/system.hbs` > 包内默认模板。修改文件在下一次任务生效，无需重启。

可用变量：`task`、`cwd`、`session`、`projectRules`、`projectContext`、`workspaceNotes`、`availableSkills`、`selectedSkills`（含 name、path、content）。例如：

```hbs
你是项目助手，请完成任务并简短回复。
{{#if projectRules}}
项目规则：
{{projectRules}}
{{/if}}
{{#each selectedSkills}}
Skill {{name}}：
{{content}}
{{/each}}
```

适配器为纯文本 prompt 配置，不做 HTML 转义，代码里的引号、`<` 和 `&` 会原样保留。`createTemplateRenderer({ helpers, partials })` 可提供独立的 helper 和 partial，每个实例互不污染。

## 项目规则和 skills

- 项目根目录的 `AGENTS.md` 原样作为规则加载。
- 可选项目说明：`~/.nanocodin/workspaces/<workspace-id>/context.md`、`memory.md`，仅只读使用。
- Skills 顺序：项目 `.agents/skills/` > `~/.nanocodin/skills/` > `~/.agents/skills/`。
- 通过 `$skill-name` 或 `/skill-name` 显式调用，加载匹配 `SKILL.md` 正文。
- 不自动写长期记忆，不维护仓库索引，不启动子 Agent。

会话文件：`~/.nanocodin/workspaces/<workspace-id>/sessions/<id>.json`。成功、错误、取消和限额停止都保留。恢复提供已有事实与中断提示，不自动重放写操作。

旧版 `phaseLimits`、`recursionLimit`、`repoIndex`、`recovery`、`compression` 配置不再生效；对应旧 CLI 参数给出弃用提示。旧 checkpoint 不自动迁移为新事件记录，旧文件保留。

## 开发

```bash
npm run dev
npm run typecheck
npm run test
npm run test:coverage
npm run test:package  # build + packed API/type checks
npm run build
npm pack --dry-run
```

```text
src/
  api.ts           公开 Harness API
  agent/           执行循环、协议和有限上下文
  tools/           文件、shell、交互工具与注册校验
  model/           可选模型适配器
  session/         事件格式、派生视图和可选文件存储
  workflows/       可替换的 coding 验证规则
  context/         项目规则与 skills
  config/          CLI 配置与路径
  cli/  ui/        默认终端应用
  prompts/         默认 coding 指令
```

`npm run build` 先清理旧产物再编译，避免已删除模块留在发布包。`frontend/` 是独立宣传站。

发布沿用 `.github/workflows/release.yml` 的 `release/*` 分支流程。本次重构不自动发布。

GPL-3.0。
