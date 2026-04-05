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

export interface VerificationCheckpoint {
  goal: string;
  commands: string[];
  latestCommand: string | null;
  latestSummary: string | null;
  status: "pending" | "passed" | "failed";
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
  status: "success" | "failed" | "no_conclusion" | "limit_reached";
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
  verification: VerificationCheckpoint;
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
  abortSignal?: AbortSignal;
  permission?: PermissionController;
  runSubtask?: (input: RunSubtaskInput) => Promise<SubtaskResult>;
  delegationDepth?: number;
  checkpoint?: SessionCheckpointStore;
}

export interface SessionCheckpoint {
  id: string;
  task: string;
  updatedAt: number;
  sessionMemory: SessionMemory | null;
  todos: TodoState;
  latestVerification: string | null;
}

export interface SessionCheckpointSummary {
  id: string;
  task: string;
  updatedAt: number;
}

export interface SessionCheckpointStore {
  load(sessionId?: string): Promise<SessionCheckpoint | null>;
  save(checkpoint: Omit<SessionCheckpoint, "id">): Promise<SessionCheckpoint>;
  clear(): Promise<void>;
  list(): Promise<SessionCheckpointSummary[]>;
}

export type ToolCapability =
  | "read_only"
  | "mutating"
  | "planning"
  | "verification"
  | "summary"
  | "delegation";

export interface ToolResult {
  ok: boolean;
  output: string;
}

export interface Tool<TInput = any> {
  name: string;
  description: string;
  capabilities?: ToolCapability[];
  schema: z.ZodType<TInput>;
  execute: (input: TInput, context: ToolContext) => Promise<ToolResult>;
}
