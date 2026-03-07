import React, { useMemo, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import type { AgentEvent, } from "../agent/reactLoop.js";
import { CodingAgentGraph } from "../agent/agentGraph.js";
import type { Message } from "../core/messageTypes.js";

interface Props {
  graph: CodingAgentGraph;
}

type LogKind =
  | "user"
  | "thought"
  | "action"
  | "observation"
  | "final"
  | "error"
  | "meta";

interface LogEntry {
  kind: LogKind;
  text: string;
}

const BRAND_COLOR = "#38bdf8";
const BANNER_LINES = [
  " _   _                         ____          _ _       ",
  "| \\ | | __ _ _ __   ___      / ___|___   __| (_)_ __  ",
  "|  \\| |/ _` | '_ \\ / _ \\____| |   / _ \\ / _` | | '_ \\ ",
  "| |\\  | (_| | | | | (_) |____| |__| (_) | (_| | | | | |",
  "|_| \\_|\\__,_|_| |_|\\___/      \\____\\___/ \\__,_|_|_| |_|"
];

function formatLogPrefix(kind: LogKind): string {
  if (kind === "user") return "● You";
  if (kind === "thought") return "◦ Nano Codin";
  if (kind === "action") return "↳ Tool";
  if (kind === "observation") return "⋯ Output";
  if (kind === "final") return "✓ Nano Codin";
  if (kind === "error") return "✕ Error";
  return "•";
}

function formatLogColor(kind: LogKind): string {
  if (kind === "user") return "white";
  if (kind === "thought") return BRAND_COLOR;
  if (kind === "action") return "cyan";
  if (kind === "observation") return "gray";
  if (kind === "final") return BRAND_COLOR;
  if (kind === "error") return "red";
  return "gray";
}

export function ConsoleApp({ graph }: Props) {
  const { exit } = useApp();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const hint = useMemo(() => {
    if (busy) {
      return "Nano Codin is reasoning...";
    }
    return "Type a coding task and press Enter. Ctrl+C to exit.";
  }, [busy]);

  useInput((char, key) => {
    if (key.ctrl && char === "c") {
      exit();
      return;
    }

    if (busy) {
      return;
    }

    if (key.return) {
      const task = input.trim();
      if (task.length === 0) {
        return;
      }

      void runTask(task);
      return;
    }

    if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
      return;
    }

    if (!key.ctrl && !key.meta && char) {
      setInput((prev) => prev + char);
    }
  });

  async function runTask(task: string) {
    setBusy(true);
    setInput("");
    setLogs((prev) => [...prev, { kind: "meta", text: "────────────────────────────────────────────────────────" }]);
    setLogs((prev) => [...prev, { kind: "user", text: task }]);

    const initialMessages: Message[] = [{ role: "user", content: task }];

    try {
      const result = await graph.run({
        messages: initialMessages,
        onEvent: (event: AgentEvent) => {
          if (event.type === "thought") {
            setLogs((prev) => [...prev, { kind: "thought", text: event.thought }]);
          } else if (event.type === "action") {
            setLogs((prev) => [
              ...prev,
              { kind: "action", text: `${event.action.name} ${JSON.stringify(event.action.input)}` }
            ]);
          } else if (event.type === "observation") {
            setLogs((prev) => [...prev, { kind: "observation", text: event.observation }]);
          } else if (event.type === "error") {
            setLogs((prev) => [...prev, { kind: "error", text: event.error }]);
          } else if (event.type === "final") {
            setLogs((prev) => [...prev, { kind: "final", text: event.answer }]);
          }
        }
      });

      setLogs((prev) => [...prev, { kind: "meta", text: `Completed in ${result.steps.length} step(s).` }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLogs((prev) => [...prev, { kind: "error", text: `Execution failed: ${message}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1} flexDirection="column">
        {BANNER_LINES.map((line, idx) => (
          <Text key={`banner-${idx}`} color={BRAND_COLOR}>
            {line}
          </Text>
        ))}
        <Text color="gray">ReAct Coding Agent</Text>
        <Text color="gray">{hint}</Text>
      </Box>

      <Box flexDirection="column">
        {logs.slice(-40).map((entry, idx) => {
          if (entry.kind === "meta") {
            return (
              <Text key={`${idx}-${entry.text.slice(0, 12)}`} color="gray">
                {entry.text}
              </Text>
            );
          }

          const lines = entry.text.split("\n");
          return (
            <Box key={`${idx}-${entry.text.slice(0, 12)}`} flexDirection="column" marginBottom={0}>
              <Text color={formatLogColor(entry.kind)}>
                {formatLogPrefix(entry.kind)}
                {"  "}
                {lines[0]}
              </Text>
              {lines.slice(1).map((line, lineIdx) => (
                <Text key={`${idx}-${lineIdx}`} color={formatLogColor(entry.kind)}>
                  {"   "}
                  {line}
                </Text>
              ))}
            </Box>
          );
        })}
      </Box>

      <Box marginTop={1} borderStyle="round" borderColor={BRAND_COLOR} paddingX={1}>
        <Text color={BRAND_COLOR}>{busy ? "…" : ">"}</Text>
        <Text> {input}</Text>
      </Box>
    </Box>
  );
}
