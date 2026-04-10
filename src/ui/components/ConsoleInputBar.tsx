import React from "react";
import { Box, Text } from "ink";
import { BRAND_COLOR } from "./ConsoleHeader.js";
import type { SlashCommandItem } from "../utils/slashCommands.js";
import { getVisiblePickerWindow } from "../utils/filePicker.js";

const MAX_VISIBLE_PICKER_ITEMS = 6;

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
  const visibleCommands = getVisiblePickerWindow(commandSuggestions, pickerSelectedIndex, MAX_VISIBLE_PICKER_ITEMS);
  const visibleFiles = getVisiblePickerWindow(pickerFiles, pickerSelectedIndex, MAX_VISIBLE_PICKER_ITEMS);
  const commandWindowStart = Math.max(0, pickerSelectedIndex - visibleCommands.length + 1);
  const fileWindowStart = Math.max(0, pickerSelectedIndex - visibleFiles.length + 1);

  return (
    <Box borderStyle="round" borderColor={BRAND_COLOR} paddingX={1} flexDirection="column">
      {visibleCommands.length > 0 ? (
        <Box flexDirection="column" marginBottom={1}>
          {visibleCommands.map((command, index) => {
            const absoluteIndex = commandWindowStart + index;
            return (
            <Text
              key={command.command}
              color={absoluteIndex === pickerSelectedIndex ? "black" : "white"}
              backgroundColor={absoluteIndex === pickerSelectedIndex ? BRAND_COLOR : undefined}
            >
              {absoluteIndex === pickerSelectedIndex ? "> " : "  "}
              {command.command}
              {" "}
              <Text color={absoluteIndex === pickerSelectedIndex ? "black" : "gray"}>
                [{command.kind === "builtin" ? "builtin" : "skill"}]
              </Text>
              {command.description ? ` ${command.description}` : ""}
            </Text>
            );
          })}
        </Box>
      ) : visibleFiles.length > 0 ? (
        <Box flexDirection="column" marginBottom={1}>
          {visibleFiles.map((file, index) => {
            const absoluteIndex = fileWindowStart + index;
            return (
            <Text
              key={file}
              color={absoluteIndex === pickerSelectedIndex ? "black" : "white"}
              backgroundColor={absoluteIndex === pickerSelectedIndex ? BRAND_COLOR : undefined}
            >
              {absoluteIndex === pickerSelectedIndex ? "> " : "  "}{file}
            </Text>
            );
          })}
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
