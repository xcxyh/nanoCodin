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
import { ZodIssueCode, type ZodError } from "zod";

function requiresPermission(toolName: string): boolean {
  return toolName === "bash";
}

function formatSchemaError(toolName: string, rawInput: unknown, error: ZodError): string {
  const keys = rawInput && typeof rawInput === "object" && !Array.isArray(rawInput)
    ? Object.keys(rawInput as Record<string, unknown>)
    : [];
  const missingFields = error.issues
    .filter((issue) => issue.code === ZodIssueCode.invalid_type && issue.received === "undefined" && issue.path.length > 0)
    .map((issue) => String(issue.path[0]));
  const messages = error.issues.map((issue) => {
    const pathLabel = issue.path.length > 0 ? `"${issue.path.join(".")}"` : "input";
    if (issue.code === ZodIssueCode.invalid_type && issue.received === "undefined") {
      return `missing required field ${pathLabel}`;
    }
    return `${pathLabel}: ${issue.message}`;
  });

  const hints: string[] = [];
  if (toolName === "str_replace") {
    const input = rawInput && typeof rawInput === "object" ? rawInput as Record<string, unknown> : {};
    if ("old_str" in input || "old_text" in input || "new_str" in input || "new_text" in input) {
      hints.push("Use field names oldText and newText.");
    }
  }
  if (toolName === "view" && missingFields.includes("path")) {
    hints.push("view can omit path only when a recent touched file exists in session memory.");
  }

  const details = [
    messages.join("; "),
    keys.length > 0 ? `received keys: ${keys.join(", ")}` : "received keys: (none)",
    ...hints
  ].filter(Boolean);

  return `Invalid input for tool ${toolName}: ${details.join(". ")}`;
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
        output: formatSchemaError(tool.name, resolvedInput, parsed.error)
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
