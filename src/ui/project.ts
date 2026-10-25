import { stripVTControlCharacters } from "node:util";
import type { ToolCall } from "../core/messageTypes.js";
import type { ToolResult } from "../core/toolTypes.js";
import type { AgentEvent, Session } from "../session/types.js";

export interface UiActivity {
  id: string;
  text: string;
  detail?: string;
  status: "running" | "success" | "error" | "denied" | "cancelled" | "timeout" | "interrupted";
  failed: boolean;
  startedAt?: number;
  endedAt?: number;
  call?: ToolCall;
  result?: ToolResult;
}
const labels: Record<string, string> = { view: "读取文件", create: "创建文件", str_replace: "修改文件", grep: "搜索代码", ls: "查看目录", bash: "运行命令", todo: "更新计划", ask_user_question: "询问用户" };

export function projectUi(session: Session, running = false) {
  const turns: Array<{ user: string; answer?: string; status?: string }> = [];
  const warnings: string[] = [];
  const activities = new Map<string, UiActivity & { index: number }>();
  let runStart = -1;
  let finished = false;
  let model: Extract<AgentEvent, { type: "model_start" }> | undefined;
  for (const [index, event] of session.events.entries()) {
    if (event.type === "notice" && (event.kind === "persistence" || event.text.startsWith("会话保存失败："))) { warnings.push(event.text); continue; }
    if (event.type === "user") {
      turns.push({ user: event.text }); runStart = index; finished = false; model = undefined;
    } else if (event.type === "model_start") model = event;
    else if (event.type === "model_end" && model?.requestId === event.requestId) model = undefined;
    else if (event.type === "finish") {
      finished = true; model = undefined;
      if (turns.length) Object.assign(turns[turns.length - 1], { answer: event.answer, status: event.status });
    } else if (event.type === "tool_start") {
      const input = event.call.input as Record<string, unknown> | null;
      activities.set(event.callId, { id: event.callId, index, text: labels[event.call.name] ?? event.call.name,
        detail: String(input?.path ?? input?.command ?? input?.pattern ?? "").slice(0, 200),
        status: "running", failed: false, startedAt: event.at, call: event.call });
    } else if (event.type === "tool_end") {
      const previous = activities.get(event.callId);
      activities.set(event.callId, { id: event.callId, index: previous?.index ?? index,
        text: previous?.text ?? labels[event.call.name] ?? event.call.name, detail: previous?.detail,
        status: event.result.ok ? "success" : event.result.reason ?? "error", failed: !event.result.ok,
        startedAt: previous?.startedAt, endedAt: event.at, call: event.call, result: event.result });
    } else if (event.type === "notice") {
      const id = `notice-${index}`;
      activities.set(id, { id, index, text: event.text.slice(0, 220), status: "error", failed: true, endedAt: event.at });
    }
  }
  for (const activity of activities.values()) {
    if (activity.status === "running" && (!running || finished || activity.index < runStart)) {
      activity.status = "interrupted"; activity.failed = true;
    }
  }
  return { warnings: [...new Set(warnings)], turns: turns.slice(-6), activity: [...activities.values()],
    model: running && !finished ? model : undefined };
}

/** Render untrusted command output as plain terminal text, with a bounded size. */
export function displayText(value: string, limit = 16000): string {
  const text = stripVTControlCharacters(value).replace(/\r/g, "\n").replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
  return text.length > limit ? `${text.slice(0, limit)}\n…[已截断]` : text;
}
export function durationText(activity: UiActivity, now: number): string {
  if (activity.status === "interrupted" && activity.endedAt === undefined) return "";
  const duration = activity.result?.effects?.command?.durationMs
    ?? (activity.startedAt !== undefined ? (activity.endedAt ?? now) - activity.startedAt : undefined);
  return duration === undefined ? "" : `${(Math.max(0, duration) / 1000).toFixed(1)}s`;
}
export function failureSummary(result: ToolResult): string {
  const source = result.effects?.command?.stderr || result.output;
  return displayText(source).split("\n").find((line) => line.trim() && !/^(exit=|stderr:$)/.test(line))?.slice(0, 160) ?? "执行失败";
}
export function activityDetails(activity: UiActivity, columns = 80): string[] {
  const input = JSON.stringify(activity.call?.input, (key, value) => /^(?:api.?key|password|token|authorization|secret)$/i.test(key) ? "[redacted]" : value, 2);
  const log = activity.result?.effects?.command;
  const output = log ? `exit=${log.exitCode ?? "unknown"}\nstdout（已保存尾部）:\n${log.stdout}\nstderr（已保存尾部）:\n${log.stderr}` : activity.result?.output ?? "尚无结束结果；运行中输出见下方。";
  const width = Math.max(12, columns - 8);
  return `参数：\n${displayText(input ?? "(none)", 4000)}\n结果：\n${displayText(output, 12000)}`.trimEnd().split("\n").flatMap((line) => {
    const chunks: string[] = []; let chunk = ""; let size = 0;
    for (const char of line) {
      const cells = char.codePointAt(0)! > 0xff ? 2 : 1;
      if (size + cells > width) { chunks.push(chunk); chunk = ""; size = 0; }
      chunk += char; size += cells;
    }
    return [...chunks, chunk];
  });
}
