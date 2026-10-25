import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import type { projectUi } from "../project.js";
import { BRAND_COLOR } from "./ConsoleHeader.js";

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
function LoadingStatus({ label }: { label: string }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setFrame((value) => (value + 1) % 120), 90);
    return () => clearInterval(timer);
  }, []);
  const lead = frame % (label.length + 6);
  return <Box marginBottom={1}>
    <Text color="gray">⏺ </Text><Text color={BRAND_COLOR}>{SPINNER[frame % SPINNER.length]} </Text>
    {Array.from(label).map((char, index) => <Text key={index} color={Math.abs(index - lead) < 2 ? BRAND_COLOR : "gray"}>{char}</Text>)}
  </Box>;
}

export function ConsoleMessagePane({ view, busy, pendingTool, waitingForUser = false }: {
  view: ReturnType<typeof projectUi>; busy: boolean; pendingTool?: string; waitingForUser?: boolean;
}) {
  return <Box flexDirection="column" marginBottom={1}>
    {view.turns.map((turn, index) => <Box key={index} flexDirection="column" marginBottom={1}>
      <Text color="white">❯ {turn.user}</Text>
      {turn.answer ? <Text color={turn.status === "complete" ? BRAND_COLOR : turn.status === "error" ? "red" : "yellow"}>⏺ {turn.answer}</Text> : null}
    </Box>)}
    {view.warnings.map((warning) => <Text key={warning} color="yellow">⏺ {warning}</Text>)}
    {busy ? <Box flexDirection="column">
      {view.activity.map((entry, index) => <Box key={index} flexDirection="column" marginBottom={1}>
        <Text color={entry.failed ? "yellow" : "gray"}>⏺ {entry.text}</Text>
        {entry.detail ? <Text color="gray">  └─ {entry.detail}</Text> : null}
      </Box>)}
      {waitingForUser ? <Text color="gray">⏺ 等待用户选择…</Text> : <LoadingStatus label={pendingTool ? `执行 ${pendingTool}…` : "思考中…"} />}
    </Box> : null}
  </Box>;
}
