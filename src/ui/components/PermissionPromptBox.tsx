import React from "react";
import { Box, Text } from "ink";
import type { PermissionRequest } from "../../core/permission.js";

export function PermissionPromptBox({ request }: { request: PermissionRequest }) {
  const { toolName, input: toolInput } = request;
  const inputRecord = toolInput as Record<string, unknown>;
  const detailLabel = toolName === "bash" ? "Command" : "Target";
  const detailValue = toolName === "bash"
    ? String(inputRecord.command ?? "(unknown)")
    : String(inputRecord.path ?? "(unknown)");

  return (
    <Box marginBottom={1} borderStyle="round" borderColor="yellow" paddingX={1} flexDirection="column">
      <Text color="yellow">Permission required</Text>
      <Text>Tool: {toolName}</Text>
      <Text>{detailLabel}: {detailValue}</Text>
      {request.reason ? <Text>Why: {request.reason}</Text> : null}
      <Text>Allow? [y] once, [a] all session, [n] deny</Text>
    </Box>
  );
}
