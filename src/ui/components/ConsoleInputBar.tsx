import React from "react";
import { Box, Text } from "ink";
import { BRAND_COLOR } from "./ConsoleHeader.js";
import type { SlashCommandItem } from "../utils/slashCommands.js";

const MAX_VISIBLE_FILES = 10;

export function ConsoleInputBar({
  input,
  cursor,
  busy,
  pickerFiles = [],
  commandSuggestions = [],
  pickerSelectedIndex = 0
}: {
  input: string;
  cursor: number;
  busy: boolean;
  pickerFiles?: string[];
  commandSuggestions?: SlashCommandItem[];
  pickerSelectedIndex?: number;
}) {
  const before = input.slice(0, cursor);
  const cursorChar = cursor < input.length ? input[cursor] : " ";
  const after = cursor < input.length ? input.slice(cursor + 1) : "";
  const visibleCommands = commandSuggestions.slice(0, MAX_VISIBLE_FILES);

  return (
    <Box borderStyle="round" borderColor={BRAND_COLOR} paddingX={1} flexDirection="column">
      {visibleCommands.length > 0 ? (
        <Box flexDirection="column" marginBottom={1}>
          {visibleCommands.map((command, index) => (
            <Text
              key={command.command}
              color={index === pickerSelectedIndex ? "black" : "white"}
              backgroundColor={index === pickerSelectedIndex ? BRAND_COLOR : undefined}
            >
              {index === pickerSelectedIndex ? "> " : "  "}
              {command.command}
              {" "}
              <Text color={index === pickerSelectedIndex ? "black" : "gray"}>
                [{command.kind === "builtin" ? "builtin" : "skill"}]
              </Text>
              {command.description ? ` ${command.description}` : ""}
            </Text>
          ))}
        </Box>
      ) : pickerFiles.length > 0 ? (
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
