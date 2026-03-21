import type { Tool, ToolContext, ToolResult } from "../core/toolTypes.js";
import { createTool } from "./edit/create.js";
import { insertTool } from "./edit/insert.js";
import { strReplaceTool } from "./edit/str_replace.js";
import { viewTool } from "./edit/view.js";
import { grepTool } from "./fs/grep.js";
import { lsTool } from "./fs/ls.js";
import { readContextTool } from "./fs/read_context.js";
import { repoIndexQueryTool } from "./fs/repo_index_query.js";
import { treeTool } from "./fs/tree.js";
import { delegateTool } from "./planning/delegate.js";
import { summarizeChangesTool } from "./planning/summarize_changes.js";
import { todoTool } from "./planning/todo.js";
import { bashTool } from "./shell/bash.js";
import { decidePolicy } from "./shell/bash.js";
import { isMutatingTool, isVerificationTool, isSummaryTool } from "../services/agentPolicy.js";

function requiresPermission(toolName: string): boolean {
  return toolName === "bash" || toolName === "create" || toolName === "insert" || toolName === "str_replace";
}

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

  getToolCapabilities(name: string): string[] {
    return this.getToolByName(name)?.capabilities ?? [];
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

    let parsedInput = parsed.data as Record<string, unknown>;

    if (context.permission && requiresPermission(tool.name)) {
      if (tool.name === "bash") {
        const command = typeof parsedInput.command === "string" ? parsedInput.command : "";
        const policyDecision = decidePolicy(command, context);
        if (policyDecision !== "deny") {
          const decision = await context.permission.request({
            toolName: tool.name,
            input: parsedInput,
            reason: this.buildPermissionReason(tool, parsedInput)
          });
          if (decision === "deny") {
            return { ok: false, output: "Permission denied by user." };
          }
          parsedInput = { ...parsedInput, confirmed: true };
        }
      } else {
        const decision = await context.permission.request({
          toolName: tool.name,
          input: parsedInput,
          reason: this.buildPermissionReason(tool, parsedInput)
        });
        if (decision === "deny") {
          return { ok: false, output: "Permission denied by user." };
        }
      }
    }

    return tool.execute(parsedInput, context);
  }

  private buildPermissionReason(tool: Tool<any>, input: Record<string, unknown>): string {
    if (tool.name === "bash") {
      if (isVerificationTool(tool)) {
        return "This command is being used to validate the change before finishing.";
      }
      return "This shell command needs approval before it can run.";
    }
    if (isMutatingTool(tool)) {
      return "This edit will modify files in the workspace.";
    }
    if (isSummaryTool(tool)) {
      return "This action prepares the final structured summary.";
    }
    if (typeof input.path === "string") {
      return `This action will operate on ${input.path}.`;
    }
    return "This action needs explicit approval.";
  }
}

export function createDefaultToolRegistry(): ToolRegistry {
  return new ToolRegistry([
    lsTool,
    treeTool,
    grepTool,
    repoIndexQueryTool,
    readContextTool,
    viewTool,
    createTool,
    strReplaceTool,
    insertTool,
    bashTool,
    todoTool,
    delegateTool,
    summarizeChangesTool
  ]);
}
