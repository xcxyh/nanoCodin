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
    sessionMemory: null,
    contextSources: {
      projectRules: [],
      projectContext: null,
      persistentMemory: null,
      availableSkills: null
    },
    delegationDepth: 0
  };
  return { ...base, ...overrides };
}
