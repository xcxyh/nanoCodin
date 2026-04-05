import React from "react";
import { Box, Text } from "ink";
import type { PermissionRequest } from "../core/permission.js";
import type { LogEntry, LogKind } from "./consoleState.js";
import type { AgentExecutionSnapshot } from "../agent/reactLoop.js";
import { formatTokenUsageText } from "./tokenUsage.js";

export const BRAND_COLOR = "#38bdf8";

const BANNER_LINES = [
  " _   _                         ____          _ _       ",
  "| \\ | | __ _ _ __   ___      / ___|___   __| (_)_ __  ",
  "|  \\| |/ _` | '_ \\ / _ \\____| |   / _ \\ / _` | | '_ \\ ",
  "| |\\  | (_| | | | | (_) |____| |__| (_) | (_| | | | | |",
  "|_| \\_|\\__,_|_| |_|\\___/      \\____\\___/ \\__,_|_|_| |_|"
];

function formatLogPrefix(kind: LogKind): string {
  if (kind === "user") return "● You";
  if (kind === "thought") return "◦ Thinking";
  if (kind === "loading") return "◦ Loading";
  if (kind === "action") return "↳ Tool";
  if (kind === "observation") return "⋯ Output";
  if (kind === "final") return "✓ Nano Codin";
  if (kind === "error") return "✕ Error";
  return "•";
}

function formatLogColor(kind: LogKind): string {
  if (kind === "user") return "white";
  if (kind === "thought") return "green";
  if (kind === "loading") return "green";
  if (kind === "action") return "cyan";
  if (kind === "observation") return "gray";
  if (kind === "final") return BRAND_COLOR;
  if (kind === "error") return "red";
  return "gray";
}

function makeThinkingText(tick: number): string {
  return `Thinking${".".repeat((tick % 3) + 1)}`;
}

function makeLoadingText(message: string, tick: number): string {
  return `${message}${".".repeat((tick % 3) + 1)}`;
}

function renderLogEntry(entry: LogEntry, thinkingTick: number): React.ReactNode {
  if (entry.kind === "meta") {
    return (
      <Text key={entry.id} color="gray">
        {entry.text}
      </Text>
    );
  }

  if (entry.kind === "observation") {
    const lines = entry.text.split("\n");
    const suffix = (entry.hiddenLineCount ?? 0) > 0 ? ` ... (${entry.hiddenLineCount} more lines)` : "";
    if (!entry.collapsed) {
      return (
        <Box key={entry.id} flexDirection="column" marginBottom={0}>
          <Text color={formatLogColor(entry.kind)}>
            {formatLogPrefix(entry.kind)}
            {"  "}
            {lines[0] ?? "(empty output)"}
          </Text>
          {lines.slice(1).map((line, lineIdx) => (
            <Text key={`${entry.id}-expanded-${lineIdx + 1}`} color={formatLogColor(entry.kind)}>
              {"   "}
              {line}
            </Text>
          ))}
        </Box>
      );
    }

    return (
      <Box key={entry.id} flexDirection="column" marginBottom={0}>
        <Text color={formatLogColor(entry.kind)}>
          {formatLogPrefix(entry.kind)}
          {"  "}
          {entry.summary ?? "(empty output)"}
          {suffix}
        </Text>
      </Box>
    );
  }

  const displayedText = entry.ephemeral ? makeThinkingText(thinkingTick) : entry.text;
  if (entry.kind === "loading") {
    const loadingText = entry.ephemeral ? makeLoadingText(entry.text, thinkingTick) : entry.text;
    const lines = loadingText.split("\n");
    return (
      <Box key={entry.id} flexDirection="column" marginBottom={0}>
        <Text color={formatLogColor(entry.kind)}>
          {formatLogPrefix(entry.kind)}
          {"  "}
          {lines[0]}
        </Text>
        {lines.slice(1).map((line, lineIdx) => (
          <Text key={`${entry.id}-${lineIdx + 1}`} color={formatLogColor(entry.kind)}>
            {"   "}
            {line}
          </Text>
        ))}
      </Box>
    );
  }

  const lines = displayedText.split("\n");
  return (
    <Box key={entry.id} flexDirection="column" marginBottom={0}>
      <Text color={formatLogColor(entry.kind)}>
        {formatLogPrefix(entry.kind)}
        {"  "}
        {lines[0]}
      </Text>
      {lines.slice(1).map((line, lineIdx) => (
        <Text key={`${entry.id}-${lineIdx + 1}`} color={formatLogColor(entry.kind)}>
          {"   "}
          {line}
        </Text>
      ))}
    </Box>
  );
}

export function ConsoleHeader({ hint, snapshot }: { hint: string; snapshot: AgentExecutionSnapshot | null }) {
  const tokenUsageText = snapshot ? formatTokenUsageText(snapshot.tokenUsage) : null;
  return (
    <Box marginBottom={1} flexDirection="column">
      {BANNER_LINES.map((line, idx) => (
        <Text key={`banner-${idx}`} color={BRAND_COLOR}>
          {line}
        </Text>
      ))}
      <Text color="gray">ReAct Coding Agent</Text>
      <Text color="gray">{hint}</Text>
      {snapshot ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color="cyan">Phase: {snapshot.phase}</Text>
          <Text color="gray">Todos: {snapshot.todos.join(" | ") || "(none)"}</Text>
          <Text color="gray">Verification: {snapshot.verificationGoal || "(none)"} / {snapshot.verificationStatus}</Text>
          <Text color="gray">Commands: {snapshot.verificationCommands.join(" | ") || "(none)"}</Text>
          <Text color="gray">Latest check: {snapshot.latestVerification ?? "(none)"}</Text>
          {tokenUsageText ? <Text color="gray">{tokenUsageText}</Text> : null}
          <Text color="gray">Subtasks: {snapshot.subtaskSummaries.join(" | ") || "(none)"}</Text>
          <Text color="gray">Next: {snapshot.sessionNextAction ?? "(none)"}</Text>
          <Text color="gray">Touched: {snapshot.touchedFiles.join(", ") || "(none)"}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

export function ConsoleLogList({ logs, thinkingTick }: { logs: LogEntry[]; thinkingTick: number }) {
  return <Box flexDirection="column">{logs.slice(-40).map((entry) => renderLogEntry(entry, thinkingTick))}</Box>;
}

export function PermissionPromptBox({ request }: { request: PermissionRequest }) {
  const { toolName, input: toolInput } = request;
  const inputRecord = toolInput as Record<string, unknown>;
  const detailLabel = toolName === "bash" ? "Command" : "Target";
  const detailValue = toolName === "bash"
    ? String(inputRecord.command ?? "(unknown)")
    : String(inputRecord.path ?? "(unknown)");

  return (
    <Box marginTop={1} borderStyle="round" borderColor="yellow" paddingX={1} flexDirection="column">
      <Text color="yellow">Permission required</Text>
      <Text>Tool: {toolName}</Text>
      <Text>{detailLabel}: {detailValue}</Text>
      {request.reason ? <Text>Why: {request.reason}</Text> : null}
      <Text>Allow? [y] once, [a] all session, [n] deny</Text>
    </Box>
  );
}

const MAX_VISIBLE_FILES = 10;

export function ConsoleInputBar({
  input,
  cursor,
  busy,
  pickerFiles = [],
  pickerSelectedIndex = 0
}: {
  input: string;
  cursor: number;
  busy: boolean;
  pickerFiles?: string[];
  pickerSelectedIndex?: number;
}) {
  const before = input.slice(0, cursor);
  const cursorChar = cursor < input.length ? input[cursor] : " ";
  const after = cursor < input.length ? input.slice(cursor + 1) : "";
  const cursorBg = busy ? "gray" : BRAND_COLOR;
  const showPicker = pickerFiles.length > 0;

  return (
    <Box marginTop={1} borderStyle="round" borderColor={BRAND_COLOR} paddingX={1} flexDirection="column">
      {showPicker ? (
        <Box flexDirection="column" marginBottom={1}>
          {pickerFiles.slice(0, MAX_VISIBLE_FILES).map((file, idx) => (
            <Text
              key={file}
              color={idx === pickerSelectedIndex ? "black" : "white"}
              backgroundColor={idx === pickerSelectedIndex ? BRAND_COLOR : undefined}
            >
              {idx === pickerSelectedIndex ? "> " : "  "}{file}
            </Text>
          ))}
        </Box>
      ) : null}
      <Box>
        <Text color={BRAND_COLOR}>{">"}</Text>
        <Text>{" "}{before}</Text>
        <Text backgroundColor={cursorBg} color="black">{cursorChar}</Text>
        <Text>{after}</Text>
      </Box>
    </Box>
  );
}
