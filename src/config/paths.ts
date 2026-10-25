import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export function resolveNanoCodinHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.NANOCODIN_HOME?.trim() ? path.resolve(env.NANOCODIN_HOME) : path.join(os.homedir(), ".nanocodin");
}
export function buildWorkspaceId(cwd: string): string {
  let resolved: string;
  try { resolved = realpathSync(cwd); } catch { resolved = path.resolve(cwd); }
  return createHash("sha1").update(resolved).digest("hex").slice(0, 12);
}
export function resolveNanoCodinPaths(cwd: string, env: NodeJS.ProcessEnv = process.env) {
  const homeDir = resolveNanoCodinHome(env);
  const workspaceId = buildWorkspaceId(cwd);
  const workspaceStateDir = path.join(homeDir, "workspaces", workspaceId);
  return {
    homeDir, workspaceId, workspaceStateDir, configYamlPath: path.join(homeDir, "config.yaml"),
    agentsPath: path.join(cwd, "AGENTS.md"), contextPath: path.join(workspaceStateDir, "context.md"),
    memoryPath: path.join(workspaceStateDir, "memory.md"), legacyContextPath: path.join(cwd, ".nanocodin", "context.md"),
    legacyMemoryPath: path.join(cwd, ".nanocodin", "memory.md")
  };
}
