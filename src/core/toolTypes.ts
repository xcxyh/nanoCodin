import type { z } from "zod";
import type { ResolvedRuntimeConfig } from "./runtimeConfig.js";
import type { PermissionController } from "./permission.js";

export interface RepoIndexEntry {
  path: string;
  lang: string;
  symbols: string[];
  imports: string[];
  summary: string;
  mtimeMs: number;
}

export interface RepoIndexSnapshot {
  generatedAt: number;
  entries: RepoIndexEntry[];
}

export interface RepoIndexQuery {
  pathPrefix?: string;
  symbol?: string;
  keyword?: string;
  maxResults?: number;
}

export interface RepoIndexProvider {
  query: (input: RepoIndexQuery) => RepoIndexEntry[];
  snapshot: () => RepoIndexSnapshot | null;
}

export interface CommandExecutionLog {
  command: string;
  policyDecision: "allow" | "ask" | "deny";
  exitCode: number | null;
  durationMs: number;
  stdoutTail: string;
  stderrTail: string;
  ok: boolean;
}

export interface WorkingMemory {
  goal: string;
  decisions: string[];
  touchedFiles: string[];
  openIssues: string[];
  nextAction: string;
}

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
  runtimeConfig: ResolvedRuntimeConfig;
  repoIndex: RepoIndexProvider;
  commandLogs: CommandExecutionLog[];
  workingMemory: WorkingMemory | null;
  permission?: PermissionController;
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
