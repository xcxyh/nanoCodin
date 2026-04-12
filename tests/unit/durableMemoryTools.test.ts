import { describe, expect, it } from "vitest";
import { rememberTool } from "../../src/tools/planning/remember.js";
import { forgetTool } from "../../src/tools/planning/forget.js";
import { createToolContext } from "../fixtures/runtime.js";
import { createDurableMemoryEntry } from "../../src/services/memoryManager.js";

describe("durable memory tools", () => {
  it("remember persists an entry and refreshes context memory", async () => {
    const context = createToolContext();
    context.durableMemoryStore = {
      async load() {
        return { entries: [], legacyText: null };
      },
      async save() {
        return;
      },
      async upsert(entry) {
        return { entries: [entry], legacyText: null };
      },
      async remove() {
        return { entries: [], legacyText: null };
      }
    };

    const result = await rememberTool.execute({
      kind: "preference",
      content: "Keep diffs small.",
      tags: ["style"]
    }, context);

    expect(result.ok).toBe(true);
    expect(result.output).toContain("remembered preference");
    expect(context.contextSources.durableMemory.entries[0]?.content).toBe("Keep diffs small.");
  });

  it("forget removes an entry and refreshes context memory", async () => {
    const existing = createDurableMemoryEntry("pitfall", "Do not broad scan.", ["search"]);
    const context = createToolContext({
      contextSources: {
        projectRules: [],
        projectContext: null,
        durableMemory: { entries: [existing], legacyText: null },
        availableSkills: null
      }
    });
    context.durableMemoryStore = {
      async load() {
        return { entries: [existing], legacyText: null };
      },
      async save() {
        return;
      },
      async upsert(entry) {
        return { entries: [entry], legacyText: null };
      },
      async remove() {
        return { entries: [], legacyText: null };
      }
    };

    const result = await forgetTool.execute({
      kind: "pitfall",
      content: "Do not broad scan."
    }, context);

    expect(result.ok).toBe(true);
    expect(result.output).toContain("removed=1");
    expect(context.contextSources.durableMemory.entries).toEqual([]);
  });
});
