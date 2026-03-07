import type { z } from "zod";

export interface TodoItem {
  id: string;
  content: string;
  completed: boolean;
}

export interface TodoState {
  items: TodoItem[];
}

export interface ToolContext {
  cwd: string;
  todos: TodoState;
}

export interface ToolResult {
  ok: boolean;
  output: string;
}

export interface Tool<TInput = any> {
  name: string;
  description: string;
  schema: z.ZodType<TInput>;
  execute: (input: TInput, context: ToolContext) => Promise<ToolResult>;
}
