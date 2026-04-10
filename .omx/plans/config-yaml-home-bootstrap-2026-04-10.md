# nanoCodin 配置与运行目录重构计划

## Requirements Summary

- 将当前分散在工作区 `.env` 与 `.nanocodin/config.toml` 的配置合并为单一 YAML 配置文件，固定保存到 `~/.nanocodin/config.yaml`。
- 删除示例文件策略：不再保留根目录 `.env.example`，也不再引入 `.nanocodin/config.toml.example`；当前仓库实际只追踪了 `.env.example`，见 `package.json:10-15`。
- nanoCodin 运行过程中写出的中间产物不再落到项目目录 `.nanocodin/`，统一迁移到用户目录 `~/.nanocodin/` 下的工作区隔离子目录。
- 启动时如果未检测到完整的模型配置，需要先进入 bootstrap 引导流程，收集 `MODEL_PROVIDER`、`base URL`、`model`、`api key`，再继续正常启动。
- 保持现有 CLI 主行为稳定：`--cwd`、`--resume`、`--new-session`、`--print-config` 仍可用，工作区本身仍由 `cwd` 决定，而不是被家目录配置覆盖。

## Current Code Facts

- 启动入口在 `runCli()`，当前会先切换到 `cwd`，再从工作区 `.env` 注入环境变量，随后加载运行时配置和 checkpoint，见 `src/cli/runCli.ts:49-58`。
- 运行时配置当前只支持工作区 `.nanocodin/config.toml`，并且帮助文案与打印配置都写死了 `config.toml` 路径和优先级说明，见 `src/services/configLoader.ts:207-229`、`src/cli/help.ts:47-48`、`src/cli/help.ts:61-82`。
- `.env` 读取是一个简单的 key=value 合并器，只负责“不覆盖已有 process.env”，见 `src/cli/runtimeEnv.ts:11-37`。
- 模型层完全依赖环境变量读取 provider/model/baseURL/apiKey，见 `src/llm/modelRouter.ts:20-31`、`src/llm/modelRouter.ts:235-344`。
- 项目上下文和持久记忆目前从工作区 `.nanocodin/context.md` 与 `.nanocodin/memory.md` 读取，见 `src/services/contextLoader.ts:11-17`、`src/services/contextLoader.ts:51-60`。
- checkpoint 目前直接写到工作区 `.nanocodin/session-checkpoint.json` 和 `.nanocodin/checkpoints/`，见 `src/services/sessionCheckpoint.ts:11-14`、`src/services/sessionCheckpoint.ts:43-88`。
- repo index 主缓存目前已经在系统临时目录，但仍保留工作区 `.nanocodin/index.json` 作为 legacy 读取路径，见 `src/services/repoIndexer.ts:93-100`。
- 文档和测试都默认“配置在工作区、通过 `.env`/`.nanocodin/config.toml` 生效”，见 `README.md:193-276`、`tests/integration/configLoader.test.ts:15-82`、`tests/smoke/index.test.ts:114-126`、`tests/unit/runCli.test.ts:25-47`。

## Decision

- 采用双层目录模型：
  - 全局用户配置：`~/.nanocodin/config.yaml`
  - 工作区状态目录：`~/.nanocodin/workspaces/<workspace-id>/`
- `workspace-id` 使用工作区绝对路径的稳定哈希值，避免不同仓库互相覆盖。
- YAML 只作为唯一持久配置文件；不再从工作区 `.env` 和 `.nanocodin/config.toml` 读取主配置。
- 为降低迁移风险，保留“进程级环境变量覆盖 YAML”的兼容层，但不再读取工作区 `.env` 文件。
- Bootstrap 为启动前强制预检步骤，只在缺失必需字段时触发；成功写入 `config.yaml` 后继续正常 CLI 启动。

## Target Shape

建议 `~/.nanocodin/config.yaml` 采用稳定、扁平但分组清晰的结构，避免再拆 provider-specific env：

```yaml
model:
  provider: openai
  baseUrl: https://api.openai.com/v1
  name: gpt-4o-mini
  apiKey: sk-...

agent:
  maxSteps: 50
  recursionLimit: 96
  verifyRequiredKeywords: [fix, bug, implement, refactor, 测试, 修复, 实现]
  phaseLimits:
    discover: 32
    plan: 16
    executeVerify: 100
  compression:
    enabled: true
    tokenThresholdRatio: 0.7
    retainRecentRatio: 0.6
    contextTokenBudget: 6000

sandbox:
  defaultPolicy: ask
  timeoutMs: 15000
  maxOutputBytes: 8192
  askPrefixes: []
  allowPrefixes: []
  denyPatterns: []

repoIndex:
  enabled: true
  maxBytes: 5000000
  ignore: [.git, node_modules, dist, .next, coverage]

recovery:
  enabled: true
  maxRetryPerStep: 1
  dedupeWindowSteps: 2
```

建议工作区状态目录为：

```text
~/.nanocodin/
  config.yaml
  workspaces/
    <workspace-id>/
      meta.json
      context.md
      memory.md
      session-checkpoint.json
      checkpoints/
      repo-index.json
```

其中 `meta.json` 记录 `cwd`、最近访问时间、hash 版本，便于 debug 与后续迁移。

## Acceptance Criteria

1. 启动时不再依赖工作区 `.env` 或 `.nanocodin/config.toml`；默认读取 `~/.nanocodin/config.yaml`。
2. `--print-config` 能展示 `config.yaml` 路径、工作区状态目录路径，以及最终生效的模型/provider 配置来源。
3. 当 `config.yaml` 缺失，或缺少 `model.provider` / `model.name` / `model.apiKey` 中任一必填项时，CLI 在创建 model provider 之前进入 bootstrap 流程。
4. Bootstrap 至少能收集并保存 `MODEL_PROVIDER`、`base URL`、`model`、`api key`；写入后同一进程继续正常启动，无需用户手动重跑。
5. Checkpoint、repo index、context/memory 等 nanoCodin 自有中间产物只写入 `~/.nanocodin/workspaces/<workspace-id>/`，工作区不再新增 `.nanocodin/` 运行时文件。
6. `--resume`、`--new-session` 的行为在新状态目录下保持兼容，checkpoint 缺失时错误提示仍然准确。
7. README、帮助文案、测试 fixtures、发布内容都不再宣称 `.env.example` 或 `.nanocodin/config.toml` 是主要配置入口。
8. 不新增第三方依赖；YAML 读写实现必须使用受控子集或本地轻量实现，符合仓库“不要引入新依赖”的约束。

## Implementation Steps

### 1. 建立统一的用户目录与路径解析层

- 新增一个专门的路径服务，例如 `src/services/userPaths.ts`，负责解析：
  - `~/.nanocodin/config.yaml`
  - `~/.nanocodin/workspaces/<workspace-id>/`
  - 工作区 `meta.json` / `context.md` / `memory.md` / checkpoint / repo-index 路径
- 将当前散落在 `src/services/contextLoader.ts:11-17`、`src/services/sessionCheckpoint.ts:11-14`、`src/services/repoIndexer.ts:97-100` 的路径拼接逻辑收口到同一处。
- `workspace-id` 复用 `RepoIndexer` 现有哈希思路，避免引入另一套不一致的目录键生成方式，参考 `src/services/repoIndexer.ts:97-99`。

### 2. 用 YAML 配置加载器替换 `.env` + TOML 双入口

- 重构 `src/services/configLoader.ts:11-229`：
  - 移除 TOML 解析与工作区 `.nanocodin/config.toml` 路径假设。
  - 增加 YAML 解析/序列化与默认值合并逻辑。
  - 将 `ResolvedRuntimeConfigResult.sources` 扩展为 `configYamlPath`、`workspaceStateDir` 等新字段。
- 替换 `src/cli/runtimeEnv.ts:11-37` 的 `.env` 文件读取职责：
  - 保留 `parsePositiveIntEnv()` 这类通用工具。
  - 将“从文件加载进程配置”的逻辑改为“从 YAML 读取 structured config”。
- 明确优先级为：
  - CLI flags > 进程级 env override > `~/.nanocodin/config.yaml` > `AGENTS.md` 指南 > defaults
- 注意：这里的 env override 只保留显式 shell 环境变量，不再隐式读取工作区 `.env` 文件。

### 3. 从环境变量驱动改为结构化 model 配置驱动

- 重构 `src/llm/modelRouter.ts:20-31`、`src/llm/modelRouter.ts:235-344`：
  - 新增 `ResolvedModelConfig` 或等价结构，而不是散落读取 `process.env.MODEL_PROVIDER`、`OPENAI_API_KEY`、`ANTHROPIC_API_KEY`。
  - `runCli()` 在 bootstrap / config load 之后拿到结构化 model 配置，再传给 modelRouter。
- 优先采用“显式参数注入 provider 配置”而不是“先把 YAML 反写回 process.env”，减少隐式副作用。
- 兼容策略：
  - 若 shell 中显式设置 env，则在 config resolve 阶段覆盖 YAML。
  - 但 modelRouter 内部不再自行决定配置来源。

### 4. 启动前插入 bootstrap 预检流程

- 在 `src/cli/runCli.ts:49-78` 之间插入 preflight：
  1. 解析用户目录路径
  2. 加载 `config.yaml`
  3. 检查 model 配置是否完整
  4. 若不完整，启动 bootstrap
  5. bootstrap 成功写回 `config.yaml`
  6. 返回完整配置并继续创建 model / graph / UI
- 新增 bootstrap 模块，建议拆为：
  - `src/bootstrap/runBootstrap.ts`：流程控制
  - `src/bootstrap/questions.ts`：provider/baseUrl/model/apiKey 问题定义与默认值
  - `src/bootstrap/persist.ts`：写入 YAML 与文件权限处理
- bootstrap UI 可以优先用 `readline/promises` 做纯终端问答，避免过早把 Ink UI 和主控制台生命周期耦合在一起。
- 必填校验：
  - provider 仅支持现有实现的 `openai` / `anthropic`
  - `model`、`apiKey` 必填
  - `baseUrl` 可选；若留空则使用 provider 默认值
- 可选增强：
  - 提示用户是否立即测试 provider 连接，但不把网络联通性作为 bootstrap 成功的硬前置条件。

### 5. 迁移所有工作区中间产物到 `~/.nanocodin/workspaces/<id>/`

- 改造 `src/services/sessionCheckpoint.ts:11-88`，checkpoint 目录切换到 workspace state dir。
- 改造 `src/services/contextLoader.ts:11-17`、`src/services/contextLoader.ts:51-60`，context/memory 改从 workspace state dir 读取。
- 改造 `src/services/repoIndexer.ts:97-100`：
  - 去掉对工作区 `.nanocodin/index.json` 的 legacy 回退；
  - 统一改为用户目录下 workspace-scoped index。
- 评估是否需要一次性迁移：
  - 若检测到工作区旧 `.nanocodin/` 中存在 checkpoint/context/memory，可在首次运行时提示并自动迁移到 workspace state dir。
  - 迁移完成后不要继续写回旧目录。

### 6. 更新 CLI 输出、帮助文档、发布清单和测试

- 修改 `src/cli/help.ts:14-49`、`src/cli/help.ts:52-83`，替换帮助文案中的 `.nanocodin/config.toml` 路径与旧优先级说明。
- 修改 `README.md:193-276`，改成 `~/.nanocodin/config.yaml` 和 `~/.nanocodin/workspaces/<id>/` 说明，同时补 bootstrap 首次运行体验。
- 修改 `package.json:10-15`，移除 `.env.example` 发布清单条目。
- 删除根目录 `.env.example`。
- 更新测试：
  - `tests/integration/configLoader.test.ts:15-82` 改为 YAML + home dir fixture
  - `tests/smoke/index.test.ts:114-126` 不再测试 `.env` 文件读取，改测 YAML/bootstrap 前置
  - `tests/unit/runCli.test.ts:25-47` 调整 mocked `sources`
  - `tests/unit/sessionCheckpoint.test.ts`、`tests/unit/contextLoader.test.ts`、`tests/unit/repoIndexer.test.ts` 增加用户目录路径断言
  - 新增 bootstrap 测试，覆盖“缺配置自动进入引导”和“写入后继续启动”

## Risks And Mitigations

- 风险：YAML 解析自己实现容易踩格式边界。
  - 缓解：只支持受控子集，字段结构固定；写入永远使用内建 serializer，读取只需覆盖本工具生成格式。
- 风险：把所有状态移到家目录后，不同工作区可能冲突。
  - 缓解：使用 realpath + hash 生成稳定 `workspace-id`，并保存 `meta.json` 反查。
- 风险：现有依赖环境变量的 modelRouter 改造面较大，容易漏掉 fallback 路径。
  - 缓解：先引入 `resolveModelConfig()` 作为单一入口，再逐步把 `modelRouter` 从 `process.env` 解耦。
- 风险：首次 bootstrap 如果和 Ink UI 生命周期耦合，会出现终端状态混乱。
  - 缓解：bootstrap 放在 `render()` 之前，优先使用 `readline`，避免和 `ConsoleApp` 并行。
- 风险：旧用户已有工作区 `.env`/`.nanocodin` 数据，直接切断会造成体验回退。
  - 缓解：保留一次性迁移与明确提示；仅保留 shell env override，不再继续支持 `.env` 文件。
- 风险：在 `config.yaml` 中明文保存 api key 有安全顾虑。
  - 缓解：创建 `~/.nanocodin` 时限制目录/文件权限，并在 README 中明确说明本地明文存储行为。

## Verification Steps

1. 单元测试：
   - YAML 读写与默认值合并
   - workspace-id 稳定性
   - bootstrap 必填校验与序列化
   - model config resolve 优先级
2. 集成测试：
   - 缺失 `config.yaml` 时自动触发 bootstrap，写入后同进程启动成功
   - `--print-config` 输出新来源路径
   - `--resume` 从 `~/.nanocodin/workspaces/<id>/checkpoints/` 成功恢复
3. 回归测试：
   - `npm run typecheck`
   - `npm run test`
   - `npm run build`
4. 手动验证：
   - 删除 `~/.nanocodin/config.yaml` 后首次运行 `nano-codin`
   - 按引导输入 provider/baseUrl/model/apiKey
   - 确认 `~/.nanocodin/config.yaml` 与 `~/.nanocodin/workspaces/<id>/` 被创建
   - 确认项目目录不再生成新的 `.nanocodin` 运行时文件

## Suggested Execution Order

1. 先做路径服务 + YAML 配置加载器，不碰 UI。
2. 再解耦 modelRouter，让 model 配置不再直接绑死 `process.env`。
3. 然后插入 bootstrap preflight。
4. 最后迁移 checkpoint/context/index 路径，补文档和测试。

## Remaining Open Point

- 当前用户需求写的是“中间产物保存到 `~/.nanocodin/`”，本计划默认采用 `~/.nanocodin/workspaces/<workspace-id>/` 子目录来隔离不同仓库。如果执行阶段你坚持全部平铺在 `~/.nanocodin/` 根目录，需要在实现前明确放弃工作区隔离；否则 checkpoint 和 context 会互相污染。
