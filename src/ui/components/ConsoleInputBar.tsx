import React from "react";
import { Box, Text } from "ink";
import { BRAND_COLOR } from "./ConsoleHeader.js";

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

  return (
    <Box marginBottom={1} borderStyle="round" borderColor={BRAND_COLOR} paddingX={1} flexDirection="column">
      {pickerFiles.length > 0 ? (
        <Box flexDirection="column" marginBottom={1}>
          {pickerFiles.slice(0, MAX_VISIBLE_FILES).map((file, index) => (
            <Text
              key={file}
              color={index === pickerSelectedIndex ? "black" : "white"}
              backgroundColor={index === pickerSelectedIndex ? BRAND_COLOR : undefined}
            >
              {index === pickerSelectedIndex ? "> " : "  "}{file}
            </Text>
          ))}
        </Box>
      ) : null}
      <Box>
        <Text color={BRAND_COLOR}>{">"}</Text>
        <Text>{" "}{before}</Text>
        <Text backgroundColor={busy ? "gray" : BRAND_COLOR} color="black">{cursorChar}</Text>
        <Text>{after}</Text>
      </Box>
    </Box>
  );
}
