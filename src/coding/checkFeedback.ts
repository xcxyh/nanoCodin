import type { CommandEvidence, ToolResult } from "../agent/tools.js";
import { isSingleCommand } from "../tools/shellCommand.js";

/** Shared by the immediate tool response and the final acceptance check, including replayed events. */
export function checkFeedback(log: CommandEvidence, reason?: ToolResult["reason"]): string | undefined {
  if (reason === "denied") return "检查未执行：命令未获授权。请说明所需权限或选择可执行的检查。";
  if (reason === "timeout") return "检查超时。请单独运行该检查，并在工具允许的范围内调整 timeoutMs。";
  if (reason === "cancelled") return "检查已取消，尚未取得退出码。";
  if (log.verification && isSingleCommand(log.command)) {
    if (log.exitCode === 0) return;
    return `检查未通过（exit=${log.exitCode ?? "unknown"}）：${log.command.slice(0, 180)}。请根据工具输出处理失败后重新检查。`;
  }
  if (!isSingleCommand(log.command)) {
    const check = log.command.match(/(?:^|&&|;)\s*((?:npm|pnpm|yarn)\s+(?:run\s+)?(?:typecheck|test|build|lint)(?=\s|[;&|>]|$))/)?.[1];
    return `未计入代码验证：组合命令、管道或重定向不能提供独立检查的退出码。bash 已在工作区执行；请单独运行${check ? ` ${check}` : "项目的检查命令"}，省略 cd、管道和额外输出。`;
  }
  return "未计入代码验证：这条命令用于查看状态或可能产生改动。请单独运行与改动相关的检查。";
}
