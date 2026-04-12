import type { z } from "zod";
import type { AskUserQuestionController } from "./askUserQuestion.js";
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

export interface DurableMemoryStoreLike {
  load(): Promise<DurableMemory>;
  save(memory: DurableMemory): Promise<void>;
  upsert(entry: DurableMemoryEntry): Promise<DurableMemory>;
  remove(kind: DurableMemoryKind, content: string): Promise<DurableMemory>;
}

export interface WorkingMemory {
  goal: string;
  activePlan: string[];
  touchedFiles: string[];
  openQuestions: string[];
  verification: string[];
  nextAction: string;
  recentFailures: string[];
}

export interface CompressionSnapshot {
  summary: string;
  decisions: string[];
  completedWork: string[];
  pendingWork: string[];
  importantEvidence: string[];
  sourceStepRange: {
    start: number;
    end: number;
  };
}

export type DurableMemoryKind = "decision" | "pitfall" | "preference" | "workspace_fact";

export interface DurableMemoryEntry {
  id: string;
  kind: DurableMemoryKind;
  content: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface DurableMemory {
  entries: DurableMemoryEntry[];
  legacyText: string | null;
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
  durableMemory: DurableMemory;
  availableSkills: string | null;
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

export type TodoStatus = "pending" | "in_progress" | "completed";

export interface TodoItem {
  id: string;
  content: string;
  status: TodoStatus;
}

export interface TodoState {
  items: TodoItem[];
  verification: VerificationCheckpoint;
  taskBundle: TaskBundle;
}

export function createEmptyTodoState(primaryTask: string | null = null): TodoState {
  return {
    items: [],
    verification: {
      goal: "",
      commands: [],
      latestCommand: null,
      latestSummary: null,
      status: "pending"
    },
    taskBundle: { primaryTask, subtasks: [], results: [] }
  };
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
  workingMemory: WorkingMemory | null;
  compressionSnapshot: CompressionSnapshot | null;
  contextSources: ContextSources;
  durableMemoryStore?: DurableMemoryStoreLike;
  abortSignal?: AbortSignal;
  permission?: PermissionController;
  askUserQuestion?: AskUserQuestionController;
  runSubtask?: (input: RunSubtaskInput) => Promise<SubtaskResult>;
  delegationDepth?: number;
  checkpoint?: SessionCheckpointStore;
}

export interface SessionCheckpoint {
  id: string;
  task: string;
  updatedAt: number;
  workingMemory: WorkingMemory | null;
  compressionSnapshot: CompressionSnapshot | null;
  todos: TodoState;
  latestVerification: string | null;
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    source: "actual" | "estimated" | "mixed";
  } | null;
  recentStepsDigest?: string[];
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
