import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, useApp, useInput, useStdout } from "ink";
import type { Agent } from "../agent/run.js";
import type { AskUserQuestionRequest } from "../core/askUserQuestion.js";
import type { ToolContext } from "../core/toolTypes.js";
import { projectSession } from "../session/project.js";
import { Input, type InputProps } from "./Input.js";
import { Question } from "./Question.js";
import { activityDetails, projectUi } from "./project.js";
import { useExitArm } from "./hooks/useExitArm.js";
import { ConsoleHeader } from "./components/ConsoleHeader.js";
import { ConsoleMessagePane, type LiveOutput } from "./components/ConsoleMessagePane.js";
import { ConsoleTodoPane } from "./components/ConsoleTodoPane.js";
import { ConsoleFooter } from "./components/ConsoleFooter.js";

interface ActiveQuestion { id: number; request: AskUserQuestionRequest; choose(choice: string): void }
export function App({ makeAgent, task, resume, modelName, version, loadFiles, loadCommands }: {
  makeAgent(ask: ToolContext["ask"]): Agent; task?: string; resume?: boolean; modelName: string; version: string;
  loadFiles?: InputProps["loadFiles"]; loadCommands?: InputProps["loadCommands"];
}) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const { exitArmedAt, clearExitArm, shouldExit } = useExitArm();
  const [details, setDetails] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [page, setPage] = useState(0);
  const live = useRef<LiveOutput | null>(null);
  const [question, setQuestion] = useState<ActiveQuestion | null>(null);
  const questionId = useRef(0);
  const ask = useCallback(<T extends string,>(request: AskUserQuestionRequest<T>, signal?: AbortSignal): Promise<T> => new Promise((resolve, reject) => {
    const cancelled = () => settle(undefined);
    const settle = (choice?: string) => {
      signal?.removeEventListener("abort", cancelled);
      setQuestion(null);
      if (choice !== undefined) resolve(choice as T);
      else { const error = new Error("已取消提问。"); error.name = "AbortError"; reject(error); }
    };
    if (signal?.aborted) { cancelled(); return; }
    signal?.addEventListener("abort", cancelled, { once: true });
    setDetails(false);
    setQuestion({ id: ++questionId.current, request, choose: settle });
  }), []);
  const [agent, setAgent] = useState(() => makeAgent(ask));
  const [revision, repaint] = useState(0);
  const [now, setNow] = useState(Date.now);
  const [busy, setBusy] = useState(false);
  const active = useRef<AbortController | null>(null);
  const booted = useRef(false);
  const run = async (text: string, continuation = false) => {
    if (active.current) return;
    clearExitArm(); live.current = null; setPage(0); setSelectedId(undefined); setNow(Date.now());
    const abort = new AbortController(); active.current = abort; setBusy(true);
    try { await agent.run(text, { signal: abort.signal, continuation,
      onEvent(event) {
        if (event.type === "tool_end" && live.current?.callId === event.callId) live.current = null;
        repaint((value) => value + 1);
      },
      onProgress(event) {
        const previous = live.current?.callId === event.callId ? live.current : { callId: event.callId, stdout: "", stderr: "" };
        live.current = { ...previous, [event.stream]: event.text.slice(-8192) };
      }
    }); }
    finally { live.current = null; active.current = null; setBusy(false); setDetails(false); setQuestion(null); repaint((value) => value + 1); }
  };
  useEffect(() => {
    if (!booted.current && (task || resume)) { booted.current = true; void run(task ?? "continue", Boolean(resume)); }
    return () => { active.current?.abort(); };
  }, []);
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [busy]);
  const session = useMemo(() => agent.session, [agent, revision]);
  const state = useMemo(() => projectSession(session), [session]);
  const view = useMemo(() => projectUi(session, busy), [session, busy]);
  useInput((char, key) => {
    if (key.escape || (key.ctrl && char === "c")) {
      if (busy) active.current?.abort();
      else if (details) { setDetails(false); clearExitArm(); }
      return;
    }
    if (question) return;
    if (key.ctrl && char === "o") {
      if (!view.activity.length) return;
      clearExitArm(); setDetails((value) => !value); setPage(0); return;
    }
    if (!details) return;
    if (key.upArrow || key.downArrow) {
      const index = view.activity.findIndex((entry) => entry.id === selectedId);
      const current = index < 0 ? view.activity.length - 1 : index;
      setSelectedId(view.activity[Math.max(0, Math.min(view.activity.length - 1, current + (key.upArrow ? -1 : 1)))]?.id);
      setPage(0);
    } else if (key.leftArrow || key.rightArrow) {
      const selected = view.activity.find((entry) => entry.id === selectedId) ?? view.activity.at(-1);
      const pageSize = Math.max(3, Math.min(12, (stdout.rows ?? 40) - 20));
      const max = selected ? Math.max(0, Math.ceil(activityDetails(selected, stdout.columns ?? 80).length / pageSize) - 1) : 0;
      setPage((value) => Math.max(0, Math.min(max, Math.min(value, max) + (key.rightArrow ? 1 : -1))));
    }
  });
  const hint = question ? "↑↓ 选择，Enter 确认，也可使用快捷键；Esc 取消。"
    : busy ? "正在执行任务，Esc 或 Ctrl+C 取消 · Ctrl+O 详情。"
    : details ? "↑↓ 选择操作 · ←→ 翻页 · Ctrl+O 收起详情" : exitArmedAt ? "再按一次 Ctrl+C 退出。" : "Enter 执行 · @ 选择文件 · / 选择命令或 skill · Ctrl+C 退出 · Ctrl+O 详情";
  return <Box flexDirection="column" paddingX={1}>
    <ConsoleHeader hint={hint} version={version} modelName={modelName} cwd={session.cwd}
      compact={view.turns.length > 0 || (stdout.columns ?? 80) < 72 || (stdout.rows ?? 40) < 30} />
    <ConsoleMessagePane view={view} busy={busy} now={now} waitingForUser={Boolean(question)} live={live.current}
      details={details && !question} selectedId={selectedId} page={page} rows={stdout.rows ?? 40} columns={stdout.columns ?? 80}
      verification={state.changed ? state.verified : undefined} />
    <ConsoleTodoPane items={state.plan} visible={busy} />
    {question ? <Question key={question.id} request={question.request} choose={question.choose} /> : null}
    <Input enabled={!busy && !question && !details} loadFiles={loadFiles} loadCommands={loadCommands}
      onActivity={clearExitArm} onExit={() => { if (shouldExit()) exit(); }}
      onSubmit={(text) => {
        if (text === "/quit") exit();
        else if (text === "/clear") { clearExitArm(); live.current = null; setDetails(false); setSelectedId(undefined); setPage(0); setAgent(makeAgent(ask)); }
        else void run(text, /^(continue|继续)$/i.test(text));
      }} />
    <ConsoleFooter modelName={modelName} tokenUsage={state.usage} />
  </Box>;
}
