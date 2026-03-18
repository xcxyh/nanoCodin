import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ContextSources } from "../core/toolTypes.js";

export interface ContextFilePaths {
  agentsPath: string;
  contextPath: string;
  memoryPath: string;
}

export function resolveContextFilePaths(cwd: string): ContextFilePaths {
  return {
    agentsPath: path.join(cwd, "AGENTS.md"),
    contextPath: path.join(cwd, ".nanocodin", "context.md"),
    memoryPath: path.join(cwd, ".nanocodin", "memory.md")
  };
}

export function parseAgentsGuidelines(filePath: string): string[] {
  if (!existsSync(filePath)) {
    return [];
  }
  const text = readFileSync(filePath, "utf8");
  const guidelines: string[] = [];
  let inCodeBlock = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock || !line || line.startsWith("#")) {
      continue;
    }
    const normalized = line.replace(/^[-*]\s+/, "").trim();
    if (normalized.length > 0) {
      guidelines.push(normalized);
    }
  }
  return guidelines.slice(0, 40);
}

function readOptionalText(filePath: string): string | null {
  if (!existsSync(filePath)) {
    return null;
  }
  const text = readFileSync(filePath, "utf8").trim();
  return text.length > 0 ? text : null;
}

export function loadContextSources(cwd: string): { sources: ContextSources; paths: ContextFilePaths } {
  const paths = resolveContextFilePaths(cwd);
  return {
    sources: {
      projectRules: parseAgentsGuidelines(paths.agentsPath),
      projectContext: readOptionalText(paths.contextPath),
      persistentMemory: readOptionalText(paths.memoryPath)
    },
    paths
  };
}
