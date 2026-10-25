import type { z } from "zod";
import type { AskUserQuestionRequest } from "./askUserQuestion.js";

export interface PlanItem {
  text: string;
  status: "pending" | "in_progress" | "completed";
}

export interface CommandEvidence {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  verification: boolean;
}

export interface ToolOutput {
  stream: "stdout" | "stderr";
  /** Bounded tail snapshot for this stream, not an append-only delta. */
  text: string;
}

export interface ToolResult {
  ok: boolean;
  reason?: "denied" | "cancelled" | "timeout";
  output: string;
  /** Facts consumed by optional workflows, never hidden agent state. */
  effects?: {
    changedFiles?: string[];
    changed?: boolean;
    command?: CommandEvidence;
    plan?: PlanItem[];
    verificationCommands?: string[];
  };
}

export interface ToolContext {
  cwd: string;
  sessionId?: string;
  signal?: AbortSignal;
  /** Optional live display; snapshots are never persisted as session events. */
  onOutput?: (output: ToolOutput) => void | Promise<void>;
  ask?: <T extends string>(request: AskUserQuestionRequest<T>, signal?: AbortSignal) => Promise<T>;
}

export interface Tool<TInput = any> {
  name: string;
  description: string;
  schema: z.ZodType<TInput>;
  /** Thrown or interrupted execution may leave changes; default false. */
  mutates?: boolean;
  execute(input: TInput, context: ToolContext): Promise<ToolResult>;
}
