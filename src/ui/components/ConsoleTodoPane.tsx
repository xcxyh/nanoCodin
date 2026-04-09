import React from "react";
import { Box, Text } from "ink";
import type { AgentExecutionSnapshot } from "../../agent/reactLoop.js";

export function ConsoleTodoPane({ snapshot }: { snapshot: AgentExecutionSnapshot | null }) {
  const todos = snapshot?.todos ?? [];

  if (todos.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="cyan">Todo</Text>
      {todos.map((todo) => (
        <Text key={todo.id} color={todo.completed ? "green" : "white"}>
          {todo.completed ? "[x]" : "[ ]"} {todo.content}
        </Text>
      ))}
    </Box>
  );
}
