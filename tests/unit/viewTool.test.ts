import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { viewTool } from "../../src/tools/edit/view.js";
import { createToolContext } from "../fixtures/runtime.js";

describe("viewTool", () => {
  it("returns a helpful message instead of failing when path is omitted and no context exists", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "nanocodin-view-"));
    const context = createToolContext({ cwd, workingMemory: null });

    const result = await viewTool.execute({}, context);

    expect(result.ok).toBe(true);
    expect(result.output).toContain("No file path provided.");
  });

  it("falls back to the most recently touched file when path is omitted", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "nanocodin-view-"));
    await writeFile(path.join(cwd, "sample.txt"), "first\nsecond\n", "utf8");
    const context = createToolContext({
      cwd,
      workingMemory: {
        goal: "Inspect sample",
        activePlan: [],
        touchedFiles: ["sample.txt"],
        openQuestions: [],
        verification: [],
        recentFailures: [],
        nextAction: "View the file."
      }
    });

    const result = await viewTool.execute({}, context);

    expect(result.ok).toBe(true);
    expect(result.output).toContain("Viewing: sample.txt");
    expect(result.output).toContain("1: first");
  });
});
