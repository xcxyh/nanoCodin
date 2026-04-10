import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileSessionCheckpointStore } from "../../src/services/sessionCheckpoint.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

function createCheckpoint(task: string) {
  return {
    task,
    updatedAt: Date.now(),
    sessionMemory: null,
    todos: {
      items: [],
      verification: {
        goal: "",
        commands: [],
        latestCommand: null,
        latestSummary: null,
        status: "pending" as const
      },
      taskBundle: { primaryTask: null, subtasks: [], results: [] }
    },
    latestVerification: null
  };
}

describe("FileSessionCheckpointStore", () => {
  it("saves checkpoints with stable ids and lists them", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "nanocodin-checkpoint-"));
    process.env.NANOCODIN_HOME = await mkdtemp(path.join(os.tmpdir(), "nanocodin-home-"));
    const store = new FileSessionCheckpointStore(cwd);

    const first = await store.save(createCheckpoint("first task"));
    const second = await store.save(createCheckpoint("updated task"));
    const sessions = await store.list();

    expect(first.id).toBe(second.id);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.id).toBe(second.id);
    expect((await store.load())?.task).toBe("updated task");
  });

  it("loads a specific session id when requested", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "nanocodin-checkpoint-"));
    process.env.NANOCODIN_HOME = await mkdtemp(path.join(os.tmpdir(), "nanocodin-home-"));
    const firstStore = new FileSessionCheckpointStore(cwd);
    const secondStore = new FileSessionCheckpointStore(cwd);

    const first = await firstStore.save(createCheckpoint("resume me"));
    await secondStore.save(createCheckpoint("latest task"));

    const loaded = await new FileSessionCheckpointStore(cwd).load(first.id);

    expect(loaded?.id).toBe(first.id);
    expect(loaded?.task).toBe("resume me");
  });

  it("ignores unknown token usage fields when loading older checkpoints", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "nanocodin-checkpoint-"));
    process.env.NANOCODIN_HOME = await mkdtemp(path.join(os.tmpdir(), "nanocodin-home-"));
    const checkpointDir = path.join(cwd, ".nanocodin");
    await mkdir(checkpointDir, { recursive: true });
    await writeFile(path.join(checkpointDir, "session-checkpoint.json"), JSON.stringify({
      id: "session-1",
      task: "resume me",
      updatedAt: Date.now(),
      sessionMemory: null,
      todos: {
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
      latestVerification: null,
      tokenUsage: {
        promptTokens: 11,
        completionTokens: 7,
        totalTokens: 18,
        source: "mixed"
      }
    }, null, 2));

    const loaded = await new FileSessionCheckpointStore(cwd).load();

    expect(loaded?.task).toBe("resume me");
    expect(loaded?.latestVerification).toBeNull();
  });
});
