import { ToolExecutionError, type Tool, type ToolContext, type ToolResult } from "../core/toolTypes.js";

/** Registration + validation only. No filesystem, model, UI or permission policy. */
export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  constructor(tools: readonly Tool[] = []) {
    for (const tool of tools) this.register(tool);
  }

  register(tool: Tool): void {
    if (!/^[a-zA-Z_][\w-]*$/.test(tool.name) || tool.name === "final") throw new Error(`Invalid or reserved tool name: ${tool.name}`);
    if (this.tools.has(tool.name)) throw new Error(`Duplicate tool: ${tool.name}`);
    this.tools.set(tool.name, tool);
  }

  list(): Tool[] { return [...this.tools.values()]; }
  getToolByName(name: string): Tool | undefined { return this.tools.get(name); }

  async execute(name: string, input: unknown, context: ToolContext): Promise<ToolResult> {
    if (context.signal?.aborted) throw new ToolExecutionError("CANCELLED", "Tool cancelled before execution.");
    const tool = this.tools.get(name);
    if (!tool) return { ok: false, code: "UNKNOWN_TOOL", output: `Unknown tool: ${name}. Available tools: ${this.list().map((item) => item.name).join(", ")}.` };
    const parsed = tool.schema.safeParse(input);
    if (!parsed.success) return { ok: false, code: "INVALID_INPUT", output: `Invalid input for ${name}: ${parsed.error.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`).join("; ")}. Use its exact schema.` };
    try {
      return await tool.execute(parsed.data, context);
    } catch (error) {
      if (context.signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
      return { ok: false, code: error instanceof ToolExecutionError ? error.code : "TOOL_ERROR", output: error instanceof Error ? error.message : String(error), effects: error instanceof ToolExecutionError ? { changed: false, uncertainChanges: error.uncertainChanges } : tool.mutates ? { uncertainChanges: true } : undefined };
    }
  }
}
