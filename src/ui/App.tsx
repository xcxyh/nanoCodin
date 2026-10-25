import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, useApp, useInput, useStdout } from "ink";
import type { Agent } from "../agent/run.js";
import type { AskUserQuestionRequest } from "../core/askUserQuestion.js";
import type { ToolContext } from "../core/toolTypes.js";
import { projectSession } from "../session/project.js";
import { Input, type InputProps } from "./Input.js";
import { Question } from "./Question.js";
import { projectUi } from "./project.js";
import { useExitArm } from "./hooks/useExitArm.js";
import { ConsoleHeader } from "./components/ConsoleHeader.js";
import { ConsoleMessagePane } from "./components/ConsoleMessagePane.js";
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
    setQuestion({ id: ++questionId.current, request, choose: settle });
  }), []);
  const [agent, setAgent] = useState(() => makeAgent(ask));
  const [, repaint] = useState(0);
  const [busy, setBusy] = useState(false);
  const active = useRef<AbortController | null>(null);
  const booted = useRef(false);
  const run = async (text: string, continuation = false) => {
    if (active.current) return;
    clearExitArm();
    const abort = new AbortController(); active.current = abort; setBusy(true);
    try { await agent.run(text, { signal: abort.signal, continuation, onEvent: () => repaint((value) => value + 1) }); }
    finally { active.current = null; setBusy(false); setQuestion(null); repaint((value) => value + 1); }
  };
  useEffect(() => {
    if (!booted.current && (task || resume)) { booted.current = true; void run(task ?? "continue", Boolean(resume)); }
    return () => { active.current?.abort(); };
  }, []);
  useInput((char, key) => {
    if (key.escape || (key.ctrl && char === "c")) active.current?.abort();
  }, { isActive: busy });
  const session = agent.session;
  const state = projectSession(session);
  const view = projectUi(session);
  const hint = question ? "↑↓ 选择，Enter 确认，也可使用快捷键；Esc 取消。"
    : busy ? "正在执行任务，Esc 或 Ctrl+C 取消。"
    : exitArmedAt ? "再按一次 Ctrl+C 退出。" : "Enter 执行 · @ 选择文件 · / 选择命令或 skill · Ctrl+C 退出";
  return <Box flexDirection="column" paddingX={1}>
    <ConsoleHeader hint={hint} version={version} modelName={modelName} cwd={session.cwd}
      compact={view.turns.length > 0 || (stdout.columns ?? 80) < 72 || (stdout.rows ?? 40) < 30} />
    <ConsoleMessagePane view={view} busy={busy} pendingTool={state.pending?.call.name} waitingForUser={Boolean(question)} />
    <ConsoleTodoPane items={state.plan} visible={busy} />
    {question ? <Question key={question.id} request={question.request} choose={question.choose} /> : null}
    <Input enabled={!busy && !question} loadFiles={loadFiles} loadCommands={loadCommands}
      onActivity={clearExitArm} onExit={() => { if (shouldExit()) exit(); }}
      onSubmit={(text) => {
        if (text === "/quit") exit();
        else if (text === "/clear") { clearExitArm(); setAgent(makeAgent(ask)); }
        else void run(text, /^(continue|继续)$/i.test(text));
      }} />
    <ConsoleFooter modelName={modelName} tokenUsage={state.usage} />
  </Box>;
}
