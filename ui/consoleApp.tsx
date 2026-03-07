import React, { useMemo, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import type { AgentEvent, } from "../agent/reactLoop.js";
import { CodingAgentGraph } from "../agent/agentGraph.js";
import type { Message } from "../core/messageTypes.js";

interface Props {
  graph: CodingAgentGraph;
}

export function ConsoleApp({ graph }: Props) {
  const { exit } = useApp();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const hint = useMemo(() => {
    if (busy) {
      return "Running agent...";
    }
    return "Type a task and press Enter. Press Ctrl+C to exit.";
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
    setLogs((prev) => [...prev, `\n> ${task}`]);

    const initialMessages: Message[] = [{ role: "user", content: task }];

    try {
      const result = await graph.run({
        messages: initialMessages,
        onEvent: (event: AgentEvent) => {
          if (event.type === "thought") {
            setLogs((prev) => [...prev, `Thought: ${event.thought}`]);
          } else if (event.type === "action") {
            setLogs((prev) => [...prev, `Action: ${event.action.name} ${JSON.stringify(event.action.input)}`]);
          } else if (event.type === "observation") {
            setLogs((prev) => [...prev, `Observation:\n${event.observation}`]);
          } else if (event.type === "error") {
            setLogs((prev) => [...prev, `Error: ${event.error}`]);
          } else if (event.type === "final") {
            setLogs((prev) => [...prev, `Final: ${event.answer}`]);
          }
        }
      });

      setLogs((prev) => [...prev, `Completed in ${result.steps.length} step(s).`]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLogs((prev) => [...prev, `Execution failed: ${message}`]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box flexDirection="column">
      <Text>{hint}</Text>
      <Text>
        {"> "}
        {input}
      </Text>
      <Box marginTop={1} flexDirection="column">
        {logs.slice(-30).map((line, idx) => (
          <Text key={`${idx}-${line.slice(0, 10)}`}>{line}</Text>
        ))}
      </Box>
    </Box>
  );
}
