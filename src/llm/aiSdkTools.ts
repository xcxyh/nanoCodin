import type { ToolSet } from "ai";
import { z } from "zod";
import type { ToolRegistry } from "../tools/registry.js";

export const FINAL_TOOL_NAME = "final";

const finalToolSchema = z.object({
  answer: z.string().min(1)
});

export function buildAiSdkToolSet(registry: ToolRegistry): ToolSet {
  if (registry.getToolByName(FINAL_TOOL_NAME)) {
    throw new Error(`Tool name "${FINAL_TOOL_NAME}" is reserved for final answers.`);
  }

  const tools: ToolSet = {};
  for (const nanoTool of registry.list()) {
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
