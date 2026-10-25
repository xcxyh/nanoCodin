import type { Tool, ToolContext, ToolResult } from "../core/toolTypes.js";

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
    context.signal?.throwIfAborted();
    const tool = this.tools.get(name);
    if (!tool) return { ok: false, output: `Unknown tool: ${name}. Available tools: ${this.list().map((item) => item.name).join(", ")}.` };
    const parsed = tool.schema.safeParse(input);
    if (!parsed.success) return { ok: false, output: `Invalid input for ${name}: ${parsed.error.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`).join("; ")}. Use its exact schema.` };
    try {
      return await tool.execute(parsed.data, context);
    } catch (error) {
      if (context.signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
      return { ok: false, output: error instanceof Error ? error.message : String(error), effects: tool.mutates ? { changed: true } : undefined };
    }
  }
}
