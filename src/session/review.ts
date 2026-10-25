import type { Session } from "./types.js";
import { projectSession } from "./project.js";

export function formatSessionReview(session: Session): string {
  const state = projectSession(session);
  const lines = [`会话：${session.id}`, `任务：${state.task}`, `状态：${state.finish?.status ?? "interrupted"}`];
  if (state.finish) lines.push(`结果：${state.finish.answer}`);
  if (state.files.length) lines.push(`文件改动：${state.files.join(", ")}`);
  for (const event of session.events) {
    if (event.type !== "tool_end" || !event.result.effects?.command) continue;
    const log = event.result.effects.command;
    lines.push(`${log.verification ? "检查" : "命令"} exit=${log.exitCode ?? "unknown"}: ${log.command.slice(0, 200)}`);
  }
  if (state.pending) lines.push(`中断操作：${state.pending.call.name}，请先检查实际状态。`);
  return lines.join("\n");
}
