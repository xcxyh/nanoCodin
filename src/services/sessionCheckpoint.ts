import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createEmptyTodoState,
  type SessionCheckpoint,
  type SessionCheckpointStore,
  type SessionCheckpointSummary,
  type TodoItem,
  type TodoStatus
} from "../core/toolTypes.js";
import { buildLegacyWorkingMemory } from "./memoryManager.js";
import { resolveNanoCodinPaths } from "./userPaths.js";

function normalizeTodoStatus(raw: unknown): TodoStatus {
  if (raw === "pending" || raw === "in_progress" || raw === "completed") {
    return raw;
  }
  return "pending";
}

function normalizeTodoItems(raw: unknown): TodoItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" && record.id.length > 0 ? record.id : null;
    const content = typeof record.content === "string" && record.content.length > 0 ? record.content : null;
    if (!id || !content) {
      return [];
    }

    const status = typeof record.completed === "boolean"
      ? (record.completed ? "completed" : "pending")
      : normalizeTodoStatus(record.status);

    return [{ id, content, status }];
  });
}

export class FileSessionCheckpointStore implements SessionCheckpointStore {
  private readonly latestFilePath: string;
  private readonly sessionsDirPath: string;
  private readonly legacyLatestFilePath: string;
  private readonly legacySessionsDirPath: string;
  private activeSessionId: string | null = null;

  constructor(cwd: string) {
    const paths = resolveNanoCodinPaths(cwd);
    this.latestFilePath = paths.latestCheckpointPath;
    this.sessionsDirPath = paths.checkpointsDir;
    this.legacyLatestFilePath = paths.legacyLatestCheckpointPath;
    this.legacySessionsDirPath = paths.legacyCheckpointsDir;
  }

  async load(sessionId?: string): Promise<SessionCheckpoint | null> {
    if (sessionId) {
      const fromId = await this.readCheckpoint(this.getSessionFilePath(sessionId));
      if (fromId) {
        this.activeSessionId = fromId.id;
      }
      return fromId;
    }

    const latest = await this.readCheckpoint(this.latestFilePath) ?? await this.readCheckpoint(this.legacyLatestFilePath);
    if (latest) {
      this.activeSessionId = latest.id;
      return latest;
    }

    const sessions = await this.list();
    if (sessions.length === 0) {
      return null;
    }

    const fallback = await this.readCheckpoint(this.getSessionFilePath(sessions[0].id));
    if (fallback) {
      this.activeSessionId = fallback.id;
    }
    return fallback;
  }

  async save(checkpoint: Omit<SessionCheckpoint, "id">): Promise<SessionCheckpoint> {
    const id = this.activeSessionId ?? createCheckpointId();
    const record: SessionCheckpoint = { ...checkpoint, id };

    await mkdir(this.sessionsDirPath, { recursive: true });
    await writeFile(this.getSessionFilePath(id), `${JSON.stringify(record, null, 2)}\n`, "utf8");
    await writeFile(this.latestFilePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");

    this.activeSessionId = id;
    return record;
  }

  async clear(): Promise<void> {
    if (this.activeSessionId) {
      await rm(this.getSessionFilePath(this.activeSessionId), { force: true });
    }

    const latest = await this.readCheckpoint(this.latestFilePath);
    if (!latest || !this.activeSessionId || latest.id === this.activeSessionId) {
      await rm(this.latestFilePath, { force: true });
    }

    this.activeSessionId = null;
  }

  async list(): Promise<SessionCheckpointSummary[]> {
    const readableDir = existsSync(this.sessionsDirPath)
      ? this.sessionsDirPath
      : this.legacySessionsDirPath;
    if (!existsSync(readableDir)) {
      return [];
    }

    const entries = await readdir(readableDir, { withFileTypes: true });
    const sessions = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map(async (entry) => this.readCheckpoint(path.join(readableDir, entry.name)))
    );

    return sessions
      .filter((session): session is SessionCheckpoint => session !== null)
      .map((session) => ({
        id: session.id,
        task: session.task,
        updatedAt: session.updatedAt
      }))
      .sort((left, right) => right.updatedAt - left.updatedAt);
  }

  private getSessionFilePath(sessionId: string): string {
    return path.join(this.sessionsDirPath, `${sessionId}.json`);
  }

  private async readCheckpoint(filePath: string): Promise<SessionCheckpoint | null> {
    if (!existsSync(filePath)) {
      return null;
    }
    try {
      const text = await readFile(filePath, "utf8");
      const parsed = JSON.parse(text) as Partial<SessionCheckpoint>;
      const recentStepsDigest = (parsed as { recentStepsDigest?: unknown }).recentStepsDigest;
      if (typeof parsed.task !== "string" || typeof parsed.updatedAt !== "number") {
        return null;
      }
      return {
        id: typeof parsed.id === "string" && parsed.id.length > 0 ? parsed.id : createCheckpointId(),
        task: parsed.task,
        updatedAt: parsed.updatedAt,
        workingMemory: parsed.workingMemory ?? buildLegacyWorkingMemory((parsed as { sessionMemory?: unknown }).sessionMemory as {
          goal?: unknown;
          decisions?: unknown;
          touchedFiles?: unknown;
          pendingVerification?: unknown;
          failureNotes?: unknown;
          nextAction?: unknown;
        } | null | undefined),
        compressionSnapshot: parsed.compressionSnapshot ?? null,
        todos: parsed.todos
          ? {
            ...createEmptyTodoState(),
            ...parsed.todos,
            items: normalizeTodoItems((parsed.todos as { items?: unknown }).items),
            verification: {
              ...createEmptyTodoState().verification,
              ...((parsed.todos as { verification?: object }).verification ?? {})
            },
            taskBundle: {
              ...createEmptyTodoState().taskBundle,
              ...((parsed.todos as { taskBundle?: object }).taskBundle ?? {})
            }
          }
          : createEmptyTodoState(),
        latestVerification: parsed.latestVerification ?? null,
        tokenUsage: (parsed as { tokenUsage?: SessionCheckpoint["tokenUsage"] }).tokenUsage ?? null,
        recentStepsDigest: Array.isArray(recentStepsDigest)
          ? recentStepsDigest.filter((item): item is string => typeof item === "string").slice(0, 20)
          : undefined
      };
    } catch {
      return null;
    }
  }
}

function createCheckpointId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
