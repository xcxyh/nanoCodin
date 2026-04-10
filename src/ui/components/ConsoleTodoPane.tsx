import React from "react";
import { Box, Text } from "ink";
import type { AgentExecutionSnapshot } from "../../agent/reactLoop.js";
import { BRAND_COLOR } from "./ConsoleHeader.js";

export function ConsoleTodoPane({
  snapshot,
  visible
}: {
  snapshot: AgentExecutionSnapshot | null;
  visible: boolean;
}) {
  const todos = snapshot?.todos ?? [];

  if (!visible || todos.length === 0) {
    return null;
  }

  return (
    <Box
      flexDirection="column"
      marginBottom={1}
      borderStyle="round"
      borderColor={BRAND_COLOR}
      paddingX={1}
    >
      <Text color={BRAND_COLOR}>Todo</Text>
      {todos.map((todo) => (
        <Text key={todo.id} color={todo.completed ? "green" : "white"}>
          {todo.completed ? "[x]" : "[ ]"} {todo.content}
        </Text>
      ))}
    </Box>
  );
}
