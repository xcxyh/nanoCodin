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

export interface SessionMemory {
  goal: string;
  decisions: string[];
  touchedFiles: string[];
  pendingVerification: string[];
  failureNotes: string[];
  nextAction: string;
}

export interface ContextSources {
  projectRules: string[];
  projectContext: string | null;
  persistentMemory: string | null;
}

export interface SubtaskResult {
  id: string;
  task: string;
  summary: string;
  evidence: string[];
  touchedFiles: string[];
  nextActionSuggestion: string;
}

export interface TaskBundle {
  primaryTask: string | null;
  subtasks: string[];
  results: SubtaskResult[];
}

export interface TodoItem {
  id: string;
  content: string;
  completed: boolean;
}

export interface TodoState {
  items: TodoItem[];
  verificationPlan: string[];
  taskBundle: TaskBundle;
}

export interface RunSubtaskInput {
  task: string;
  maxSteps?: number;
}

export interface ToolContext {
  cwd: string;
  todos: TodoState;
  runtimeConfig: ResolvedRuntimeConfig;
  repoIndex: RepoIndexProvider;
  commandLogs: CommandExecutionLog[];
  sessionMemory: SessionMemory | null;
  contextSources: ContextSources;
  permission?: PermissionController;
  runSubtask?: (input: RunSubtaskInput) => Promise<SubtaskResult>;
  delegationDepth?: number;
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
