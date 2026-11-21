import { DEFAULT_RUNTIME_CONFIG, type SandboxConfig } from "../config/types.js";
import { fileTools } from "./files.js";
import { createShellTool } from "./shell.js";
import { askUserQuestion, todo } from "./interaction.js";
export { defineTool, ToolRegistry } from "../agent/tools.js";
export { fileTools, ls, grep, view, create, strReplace } from "./files.js";
export { createShellTool } from "./shell.js";
export { askUserQuestion, todo } from "./interaction.js";
export function createDefaultTools(shell: SandboxConfig = DEFAULT_RUNTIME_CONFIG.sandbox) {
  return [...fileTools, createShellTool(shell), todo, askUserQuestion];
}
