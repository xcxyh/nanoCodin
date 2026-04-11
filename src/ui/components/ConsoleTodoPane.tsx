import React from "react";
import { Box, Text } from "ink";
import type { AgentExecutionSnapshot } from "../../agent/reactLoop.js";
import { BRAND_COLOR } from "./ConsoleHeader.js";

function todoDisplay(status: AgentExecutionSnapshot["todos"][number]["status"]): { icon: string; color: string } {
  if (status === "completed") {
    return { icon: "●", color: "green" };
  }
  if (status === "in_progress") {
    return { icon: "◐", color: BRAND_COLOR };
  }
  return { icon: "○", color: "white" };
}

export function ConsoleTodoPane({
  snapshot,
  visible
}: {
  snapshot: AgentExecutionSnapshot | null;
  visible: boolean;
}) {
  if (!visible || !snapshot || snapshot.todos.length === 0) {
    return null;
  }

  const currentSnapshot = snapshot;
  const todos = currentSnapshot.todos;

  return (
    <Box
      flexDirection="column"
      marginBottom={1}
      borderStyle="round"
      borderColor={BRAND_COLOR}
      paddingX={1}
    >
      <Text color={BRAND_COLOR}>
        Tasks
        <Text color="white">  {currentSnapshot.todoProgressText}</Text>
        <Text color="gray">  </Text>
        <Text color="white">○ {currentSnapshot.todoCounts.pending}</Text>
        <Text color="gray">  </Text>
        <Text color={BRAND_COLOR}>◐ {currentSnapshot.todoCounts.inProgress}</Text>
        <Text color="gray">  </Text>
        <Text color="green">● {currentSnapshot.todoCounts.completed}</Text>
        <Text color="gray">
          {" "}items
        </Text>
      </Text>
      {todos.map((todo) => {
        const display = todoDisplay(todo.status);
        return (
          <Text key={todo.id} color={display.color}>
            {display.icon} {todo.content}{todo.status === "in_progress" ? " (进行中)" : ""}
          </Text>
        );
      })}
    </Box>
  );
}
