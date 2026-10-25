import type { Session } from "../session/types.js";

export function projectUi(session: Session) {
  const turns: Array<{ user: string; answer?: string; status?: string }> = [];
  const warnings: string[] = [];
  const activities = new Map<string, { text: string; detail?: string; failed: boolean }>();
  for (const event of session.events) {
    if (event.type === "notice" && (event.kind === "persistence" || event.text.startsWith("会话保存失败："))) {
      warnings.push(event.text);
      continue;
    }
    if (event.type === "user") { turns.push({ user: event.text }); activities.clear(); }
    else if (event.type === "finish" && turns.length) Object.assign(turns[turns.length - 1], { answer: event.answer, status: event.status });
    else if (event.type === "tool_start") {
      const input = event.call.input as Record<string, unknown> | null;
      const detail = input?.path ?? input?.command ?? input?.pattern ?? "";
      const labels: Record<string, string> = { view: "读取文件", create: "创建文件", str_replace: "修改文件", grep: "搜索代码", ls: "查看目录", bash: "运行命令", todo: "更新计划", ask_user_question: "询问用户" };
      activities.set(event.callId, { text: labels[event.call.name] ?? event.call.name, detail: String(detail).slice(0, 200), failed: false });
    } else if (event.type === "tool_end") {
      const previous = activities.get(event.callId);
      activities.set(event.callId, { text: `${event.result.ok ? "✓" : "✗"} ${previous?.text ?? event.call.name}${!event.result.ok ? `: ${event.result.output.split("\n")[0].slice(0, 140)}` : ""}`, detail: previous?.detail, failed: !event.result.ok });
    } else if (event.type === "notice") activities.set(`notice-${event.at}-${activities.size}`, { text: event.text.slice(0, 220), failed: true });
  }
  return { warnings: [...new Set(warnings)], turns: turns.slice(-6), activity: [...activities.values()].slice(-8) };
}
