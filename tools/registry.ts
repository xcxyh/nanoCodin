import type { Tool, ToolContext, ToolResult } from "../core/toolTypes.js";
import { createTool } from "./edit/create.js";
import { insertTool } from "./edit/insert.js";
import { strReplaceTool } from "./edit/str_replace.js";
import { viewTool } from "./edit/view.js";
import { grepTool } from "./fs/grep.js";
import { lsTool } from "./fs/ls.js";
import { treeTool } from "./fs/tree.js";
import { todoTool } from "./planning/todo.js";
import { bashTool } from "./shell/bash.js";

export class ToolRegistry {
  private readonly toolMap: Map<string, Tool>;

  constructor(tools: Tool[]) {
    this.toolMap = new Map(tools.map((tool) => [tool.name, tool]));
  }

  list(): Tool[] {
    return [...this.toolMap.values()];
  }

  getToolByName(name: string): Tool | undefined {
    return this.toolMap.get(name);
  }

  formatToolsForPrompt(): string {
    return this.list()
      .map((tool) => `- ${tool.name}: ${tool.description}`)
      .join("\n");
  }

  async execute(name: string, rawInput: unknown, context: ToolContext): Promise<ToolResult> {
    const tool = this.getToolByName(name);
    if (!tool) {
      return { ok: false, output: `Unknown tool: ${name}` };
    }

    const parsed = tool.schema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        ok: false,
        output: `Invalid input for tool ${name}: ${parsed.error.message}`
      };
    }

    return tool.execute(parsed.data, context);
  }
}

export function createDefaultToolRegistry(): ToolRegistry {
  return new ToolRegistry([
    lsTool,
    treeTool,
    grepTool,
    viewTool,
    createTool,
    strReplaceTool,
    insertTool,
    bashTool,
    todoTool
  ]);
}
