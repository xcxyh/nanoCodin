import { DEFAULT_RUNTIME_CONFIG, type ResolvedRuntimeConfig } from "../../src/core/runtimeConfig.js";
import type { RepoIndexProvider, ToolContext } from "../../src/core/toolTypes.js";

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
    todos: { items: [] },
    runtimeConfig: cloneConfig(),
    repoIndex: createRepoIndexStub(),
    commandLogs: [],
    workingMemory: null
  };
  return { ...base, ...overrides };
}
