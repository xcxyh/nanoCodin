import type { ToolSet } from "ai";
import { finalToolSchema } from "../agent/protocol.js";
import type { Tool } from "../core/toolTypes.js";

export const FINAL_TOOL_NAME = "final";

export function buildAiSdkToolSet(definitions: readonly Tool[]): ToolSet {
  if (definitions.some((tool) => tool.name === FINAL_TOOL_NAME)) {
    throw new Error(`Tool name "${FINAL_TOOL_NAME}" is reserved for final answers.`);
  }

  const tools: ToolSet = Object.create(null);
  for (const nanoTool of definitions) {
    tools[nanoTool.name] = {
      description: nanoTool.description,
      parameters: nanoTool.schema
    };
  }
  tools[FINAL_TOOL_NAME] = {
    description: "Return the final answer when the task is complete.",
    parameters: finalToolSchema
  };
  return tools;
}
