import React from "react";
import { Box, Text } from "ink";
import type { AskUserQuestionRequest } from "../../core/askUserQuestion.js";

export function AskUserQuestionBox({
  request,
  selectedIndex
}: {
  request: AskUserQuestionRequest;
  selectedIndex: number;
}) {
  return (
    <Box marginBottom={1} borderStyle="round" borderColor="yellow" paddingX={1} flexDirection="column">
      <Text color="yellow">{request.title}</Text>
      {request.body ? <Text>{request.body}</Text> : null}
      {request.details?.map((detail) => (
        <Text key={`${detail.label}:${detail.value}`}>
          {detail.label}: {detail.value}
        </Text>
      ))}
      <Box flexDirection="column" marginTop={request.details?.length || request.body ? 1 : 0}>
        {request.options.map((option, index) => {
          const active = index === selectedIndex;
          const suffix = option.shortcutKey ? ` [${option.shortcutKey}]` : "";
          return (
            <Text
              key={option.value}
              color={active ? "black" : "white"}
              backgroundColor={active ? "yellow" : undefined}
            >
              {active ? "> " : "  "}
              {option.label}
              {suffix}
            </Text>
          );
        })}
      </Box>
    </Box>
  );
}
