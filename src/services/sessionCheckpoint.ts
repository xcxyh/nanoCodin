import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SessionCheckpoint, SessionCheckpointStore, SessionCheckpointSummary } from "../core/toolTypes.js";

export class FileSessionCheckpointStore implements SessionCheckpointStore {
  private readonly latestFilePath: string;
  private readonly sessionsDirPath: string;
  private activeSessionId: string | null = null;

  constructor(cwd: string) {
    this.latestFilePath = path.join(cwd, ".nanocodin", "session-checkpoint.json");
    this.sessionsDirPath = path.join(cwd, ".nanocodin", "checkpoints");
  }

  async load(sessionId?: string): Promise<SessionCheckpoint | null> {
    if (sessionId) {
      const fromId = await this.readCheckpoint(this.getSessionFilePath(sessionId));
      if (fromId) {
        this.activeSessionId = fromId.id;
      }
      return fromId;
    }

    const latest = await this.readCheckpoint(this.latestFilePath);
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
    if (!existsSync(this.sessionsDirPath)) {
      return [];
    }

    const entries = await readdir(this.sessionsDirPath, { withFileTypes: true });
    const sessions = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map(async (entry) => this.readCheckpoint(path.join(this.sessionsDirPath, entry.name)))
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
      if (typeof parsed.task !== "string" || typeof parsed.updatedAt !== "number") {
        return null;
      }
      return {
        id: typeof parsed.id === "string" && parsed.id.length > 0 ? parsed.id : createCheckpointId(),
        task: parsed.task,
        updatedAt: parsed.updatedAt,
        sessionMemory: parsed.sessionMemory ?? null,
        todos: parsed.todos ?? {
          items: [],
          verification: {
            goal: "",
            commands: [],
            latestCommand: null,
            latestSummary: null,
            status: "pending"
          },
          taskBundle: { primaryTask: null, subtasks: [], results: [] }
        },
        latestVerification: parsed.latestVerification ?? null
      };
    } catch {
      return null;
    }
  }
}

function createCheckpointId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
