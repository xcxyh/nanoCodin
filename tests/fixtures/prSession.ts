// Selected public evidence from session mwpoefey-0caaad0d, 2026-11-21.
// Rows 157 and 193 returned the URL and full local / remote / PR SHAs.
// Split the readback into independent commands so no shell wrapper can mask failure.
export const prSession = {
  task: "帮我分批次提交下当前分支的变更，然后提个github mr",
  url: "https://github.com/xcxyh/nanoCodin/pull/8",
  branch: "refactor/module-boundaries",
  head: "6663649556b3c1dac4add9a84a508ff83a3d4a25",
  commits: [
    "refactor(agent): 拆分任务循环为职责单一的模块",
    "refactor(config): 把运行配置类型与初始化并入 config",
    "refactor(session): 用基础快照加日志段保存会话",
    "refactor(coding): 用事件推导验收并收敛工具装配",
    "test: 按新模块边界调整用例",
    "docs: 补充架构导读并标注历史归档"
  ]
};
