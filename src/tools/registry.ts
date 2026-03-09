import type { Tool, ToolContext, ToolResult } from "../core/toolTypes.js";
import { createTool } from "./edit/create.js";
import { insertTool } from "./edit/insert.js";
import { strReplaceTool } from "./edit/str_replace.js";
import { viewTool } from "./edit/view.js";
import { grepTool } from "./fs/grep.js";
import { lsTool } from "./fs/ls.js";
import { repoIndexQueryTool } from "./fs/repo_index_query.js";
import { treeTool } from "./fs/tree.js";
import { todoTool } from "./planning/todo.js";
import { bashTool } from "./shell/bash.js";

export class ToolRegistry {
  private readonly toolMap: Map<string, Tool<any>>;

  constructor(tools: Tool<any>[]) {
    this.toolMap = new Map(tools.map((tool) => [tool.name, tool]));
  }

  list(): Tool<any>[] {
    return [...this.toolMap.values()];
  }

  getToolByName(name: string): Tool<any> | undefined {
    return this.toolMap.get(name);
  }

  formatToolsForPrompt(): string {
    return this.list()
      .map((tool) => `- ${tool.name}: ${tool.description}`)
      .join("\n");
  }

  async execute(name: string, rawInput: unknown, context: ToolContext): Promise<ToolResult> {
    const normalizedName = name.trim();
    let tool = this.getToolByName(normalizedName);
    let resolvedInput: unknown = rawInput;

    if (!tool) {
      const decodedName = normalizedName
        .replace(/&quot;/g, "\"")
        .replace(/&#34;/g, "\"")
        .replace(/&apos;/g, "'")
        .replace(/&#39;/g, "'");
      const inlineMatch = decodedName.match(/^([a-zA-Z0-9_:-]+)\s+(\{[\s\S]*\})$/);
      if (inlineMatch) {
        const candidate = inlineMatch[1];
        tool = this.getToolByName(candidate);
        if (tool) {
          try {
            resolvedInput = JSON.parse(inlineMatch[2]);
          } catch {
            resolvedInput = rawInput;
          }
        }
      }
    }

    if (!tool) {
      return { ok: false, output: `Unknown tool: ${name}` };
    }

    const parsed = tool.schema.safeParse(resolvedInput);
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
    repoIndexQueryTool,
    viewTool,
    createTool,
    strReplaceTool,
    insertTool,
    bashTool,
    todoTool
  ]);
}
