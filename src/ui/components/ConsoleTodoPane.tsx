import React from "react";
import { Box, Text } from "ink";
import type { PlanItem } from "../../core/toolTypes.js";
import { BRAND_COLOR } from "./ConsoleHeader.js";

export function ConsoleTodoPane({ items, visible }: { items: PlanItem[]; visible: boolean }) {
  if (!visible || !items.length) return null;
  const completed = items.filter((item) => item.status === "completed").length;
  const active = items.filter((item) => item.status === "in_progress").length;
  return <Box flexDirection="column" marginBottom={1} borderStyle="round" borderColor={BRAND_COLOR} paddingX={1}>
    <Text color={BRAND_COLOR}>Tasks <Text color="white">已完成 {completed}/{items.length}</Text></Text>
    <Text color="gray">○ {items.length - completed - active}  ◐ {active}  ● {completed}</Text>
    {items.map((item, index) => <Text key={index} color={item.status === "completed" ? "green" : item.status === "in_progress" ? BRAND_COLOR : "white"}>
      {item.status === "completed" ? "●" : item.status === "in_progress" ? "◐" : "○"} {item.text}{item.status === "in_progress" ? " (进行中)" : ""}
    </Text>)}
  </Box>;
}
