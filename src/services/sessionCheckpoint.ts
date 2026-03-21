import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SessionCheckpoint, SessionCheckpointStore } from "../core/toolTypes.js";

export class FileSessionCheckpointStore implements SessionCheckpointStore {
  private readonly filePath: string;

  constructor(cwd: string) {
    this.filePath = path.join(cwd, ".nanocodin", "session-checkpoint.json");
  }

  async load(): Promise<SessionCheckpoint | null> {
    if (!existsSync(this.filePath)) {
      return null;
    }
    try {
      const text = await readFile(this.filePath, "utf8");
      return JSON.parse(text) as SessionCheckpoint;
    } catch {
      return null;
    }
  }

  async save(checkpoint: SessionCheckpoint): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
  }

  async clear(): Promise<void> {
    await rm(this.filePath, { force: true });
  }
}
