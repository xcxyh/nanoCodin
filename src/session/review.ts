import { stripVTControlCharacters } from "node:util";
import type { Session } from "./types.js";
import { projectSession } from "./project.js";

export function formatSessionReview(session: Session): string {
  const state = projectSession(session);
  const lines = [`会话：${session.id}`, `任务：${state.task}`, `状态：${state.finish?.status ?? "interrupted"}`];
  if (state.finish) lines.push(`结果：${state.finish.answer}`);
  const files = [...new Set(session.events.flatMap((event) => event.type === "tool_end" ? event.result.effects?.changedFiles ?? [] : []))];
  if (files.length) lines.push(`文件改动：${files.join(", ")}`);
  for (const event of session.events) {
    if (event.type !== "tool_end" || !event.result.effects?.command) continue;
    const log = event.result.effects.command;
    lines.push(`${log.verification ? "检查" : "命令"} exit=${log.exitCode ?? "unknown"}: ${log.command.slice(0, 200)}`);
  }
  const rounds = new Map(session.events.filter((event) => event.type === "model_start").map((event) => [event.requestId, event.round]));
  for (const event of session.events) {
    if (event.type !== "model_end") continue;
    const info = event.failure ?? event.request;
    if (!info) continue;
    lines.push(`模型请求 round=${rounds.get(event.requestId) ?? "?"} status=${event.status}${event.failure ? ` kind=${event.failure.kind}` : ""} attempts=${info.attempts} duration=${info.durationMs}ms received=${info.receivedBytes}B${info.httpStatus ? ` HTTP=${info.httpStatus}` : ""}${info.requestId ? ` requestId=${info.requestId}` : ""}`);
  }
  if (state.pending) lines.push(`中断操作：${state.pending.call.name}，请先检查实际状态。`);
  return stripVTControlCharacters(lines.join("\n"));
}
