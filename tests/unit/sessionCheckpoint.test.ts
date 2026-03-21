import { mkdtemp, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FileSessionCheckpointStore } from "../../src/services/sessionCheckpoint.js";

describe("FileSessionCheckpointStore", () => {
  it("saves, loads, and clears a checkpoint", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "nanocodin-checkpoint-"));
    await mkdir(path.join(cwd, ".nanocodin"), { recursive: true });
    const store = new FileSessionCheckpointStore(cwd);

    await store.save({
      task: "continue",
      updatedAt: Date.now(),
      sessionMemory: null,
      latestVerification: "passed",
      todos: {
        items: [],
        verification: {
          goal: "Run tests",
          commands: ["npm run test"],
          latestCommand: "npm run test",
          latestSummary: "OK",
          status: "passed"
        },
        taskBundle: { primaryTask: null, subtasks: [], results: [] }
      }
    });

    const loaded = await store.load();
    expect(loaded?.task).toBe("continue");
    expect(loaded?.todos.verification.goal).toBe("Run tests");

    await store.clear();
    expect(await store.load()).toBeNull();
  });
});
