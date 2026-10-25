import React from "react";
import { Box, Text } from "ink";
import { activityDetails, displayText, durationText, failureSummary, type projectUi } from "../project.js";
import { BRAND_COLOR } from "./ConsoleHeader.js";

export interface LiveOutput { callId: string; stdout: string; stderr: string }
const marks = { running: "●", success: "✓", error: "✗", denied: "拒绝", cancelled: "取消", timeout: "超时", interrupted: "上次中断 · 待核对" };
export function ConsoleMessagePane({ view, busy, waitingForUser = false, now = Date.now(), live, details = false, selectedId, page = 0, rows = 40, columns = 80, verification }: {
  view: ReturnType<typeof projectUi>; busy: boolean; waitingForUser?: boolean; now?: number; live?: LiveOutput | null;
  details?: boolean; selectedId?: string; page?: number; rows?: number; columns?: number; verification?: boolean;
}) {
  const selected = view.activity.find((entry) => entry.id === selectedId) ?? view.activity.at(-1);
  const selectedIndex = selected ? view.activity.indexOf(selected) : 0;
  const count = Math.max(2, Math.min(8, Math.floor((rows - 16) / 2)));
  const start = details ? Math.max(0, selectedIndex - count + 1) : Math.max(0, view.activity.length - count);
  const visible = view.activity.slice(start, start + count);
  const active = [...view.activity].reverse().find((entry) => entry.status === "running");
  const output = live && active?.id === live.callId ? (["stdout", "stderr"] as const).flatMap((stream) => {
    const text = displayText(live[stream]).trimEnd();
    const count = live.stdout && live.stderr ? (stream === "stdout" ? 2 : 1) : 3;
    return text ? text.split("\n").slice(-count).map((line) => `${stream} │ ${line}`) : [];
  }) : [];
  const lines = details && selected ? activityDetails(selected, columns) : [];
  const pageSize = Math.max(3, Math.min(12, rows - 20));
  const offset = Math.min(Math.max(0, page), Math.max(0, Math.ceil(lines.length / pageSize) - 1)) * pageSize;
  const status = waitingForUser ? "等待用户选择…" : active ? `执行 ${active.text} · ${durationText(active, now)}`
    : view.model ? `等待模型响应 · 第 ${view.model.round} 轮 · 已等待 ${((Math.max(0, now - view.model.at)) / 1000).toFixed(1)}s` : "处理中…";
  return <Box flexDirection="column" marginBottom={1}>
    {view.turns.slice(-Math.max(1, Math.min(6, Math.floor((rows - 20) / 4)))).map((turn, index) => <Box key={index} flexDirection="column" marginBottom={1}>
      <Text color="white">❯ {turn.user}</Text>
      {turn.answer ? <Text color={turn.status === "complete" ? BRAND_COLOR : turn.status === "error" ? "red" : "yellow"}>⏺ {turn.answer}</Text> : null}
    </Box>)}
    {view.warnings.map((warning) => <Text key={warning} color="yellow">⏺ {warning}</Text>)}
    {view.activity.length && (busy || details) ? <Box flexDirection="column" marginBottom={1}>
      <Text color="gray">执行记录 · {view.activity.length} 项{!details && start ? ` · 较早 ${start} 项可展开查看` : ""} · Ctrl+O {details ? "收起" : "详情"}</Text>
      {visible.map((entry) => <Box key={entry.id} flexDirection="column">
        <Text color={entry.failed ? "yellow" : entry.status === "success" ? "green" : "gray"} wrap="truncate-end">
          {details && entry.id === selected?.id ? "> " : "  "}{marks[entry.status]} {displayText(entry.text, 220)} {durationText(entry, now)}
          {entry.result?.effects?.command ? ` exit=${entry.result.effects.command.exitCode ?? "unknown"}` : ""}
          {entry.detail ? ` · ${displayText(entry.detail, 200)}` : ""}
        </Text>
        {entry.failed && entry.result ? <Text color="yellow" wrap="truncate-end">  └─ {failureSummary(entry.result)}</Text> : null}
      </Box>)}
    </Box> : null}
    {details && selected ? <Box borderStyle="round" borderColor={BRAND_COLOR} flexDirection="column" paddingX={1}>
      <Text color={BRAND_COLOR}>操作详情 {selectedIndex + 1}/{view.activity.length} · 页 {Math.floor(offset / pageSize) + 1}/{Math.max(1, Math.ceil(lines.length / pageSize))}</Text>
      <Text color="gray">↑↓ 选择操作 · ←→ 翻页 · Ctrl+O 收起</Text>
      {lines.slice(offset, offset + pageSize).map((line, index) => <Text key={index} wrap="truncate-end">{line || " "}</Text>)}
    </Box> : null}
    {output.length ? <Text color="gray">实时输出 · stdout/stderr 尾部</Text> : null}
    {output.map((line, index) => <Text key={index} color="gray" wrap="truncate-end">  {line.slice(0, 500)}</Text>)}
    {verification !== undefined ? <Text color={verification ? "green" : "yellow"}>最新改动：{verification ? "已验证" : "待验证"}</Text> : null}
    {busy ? <Text color={BRAND_COLOR}>{"⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"[Math.floor(now / 100) % 10]} {status}</Text> : null}
  </Box>;
}
