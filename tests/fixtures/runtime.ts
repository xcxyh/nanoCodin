import { DEFAULT_RUNTIME_CONFIG, type ResolvedRuntimeConfig } from "../../src/core/runtimeConfig.js";
import { createEmptyTodoState, type RepoIndexProvider, type ToolContext } from "../../src/core/toolTypes.js";

export function cloneConfig(): ResolvedRuntimeConfig {
  return JSON.parse(JSON.stringify(DEFAULT_RUNTIME_CONFIG)) as ResolvedRuntimeConfig;
}

export function createRepoIndexStub(): RepoIndexProvider {
  return {
    query: () => [],
    snapshot: () => null
  };
}

export function createToolContext(overrides?: Partial<ToolContext>): ToolContext {
  const base: ToolContext = {
    cwd: process.cwd(),
    todos: createEmptyTodoState(),
    runtimeConfig: cloneConfig(),
    repoIndex: createRepoIndexStub(),
    commandLogs: [],
    workingMemory: null,
    compressionSnapshot: null,
    contextSources: {
      projectRules: [],
      projectContext: null,
      durableMemory: {
        entries: [],
        legacyText: null
      },
      availableSkills: null
    },
    durableMemoryStore: {
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
    },
    delegationDepth: 0
  };
  return { ...base, ...overrides };
}
