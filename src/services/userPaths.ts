import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface NanoCodinPaths {
  homeDir: string;
  configYamlPath: string;
  workspacesDir: string;
  workspaceId: string;
  workspaceStateDir: string;
  workspaceMetaPath: string;
  agentsPath: string;
  contextPath: string;
  memoryPath: string;
  latestCheckpointPath: string;
  checkpointsDir: string;
  repoIndexPath: string;
  legacyWorkspaceDir: string;
  legacyContextPath: string;
  legacyMemoryPath: string;
  legacyLatestCheckpointPath: string;
  legacyCheckpointsDir: string;
  legacyRepoIndexPath: string;
}

function resolveWorkspacePath(cwd: string): string {
  try {
    return realpathSync(cwd);
  } catch {
    return path.resolve(cwd);
  }
}

export function resolveNanoCodinHome(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.NANOCODIN_HOME?.trim();
  if (configured) {
    return path.resolve(configured);
  }
  return path.join(os.homedir(), ".nanocodin");
}

export function buildWorkspaceId(cwd: string): string {
  return createHash("sha1").update(resolveWorkspacePath(cwd)).digest("hex").slice(0, 12);
}

export function resolveNanoCodinPaths(cwd: string, env: NodeJS.ProcessEnv = process.env): NanoCodinPaths {
  const homeDir = resolveNanoCodinHome(env);
  const workspaceId = buildWorkspaceId(cwd);
  const workspaceDir = path.join(homeDir, "workspaces", workspaceId);
  const legacyWorkspaceDir = path.join(cwd, ".nanocodin");

  return {
    homeDir,
    configYamlPath: path.join(homeDir, "config.yaml"),
    workspacesDir: path.join(homeDir, "workspaces"),
    workspaceId,
    workspaceStateDir: workspaceDir,
    workspaceMetaPath: path.join(workspaceDir, "meta.json"),
    agentsPath: path.join(cwd, "AGENTS.md"),
    contextPath: path.join(workspaceDir, "context.md"),
    memoryPath: path.join(workspaceDir, "memory.md"),
    latestCheckpointPath: path.join(workspaceDir, "session-checkpoint.json"),
    checkpointsDir: path.join(workspaceDir, "checkpoints"),
    repoIndexPath: path.join(workspaceDir, "repo-index.json"),
    legacyWorkspaceDir,
    legacyContextPath: path.join(legacyWorkspaceDir, "context.md"),
    legacyMemoryPath: path.join(legacyWorkspaceDir, "memory.md"),
    legacyLatestCheckpointPath: path.join(legacyWorkspaceDir, "session-checkpoint.json"),
    legacyCheckpointsDir: path.join(legacyWorkspaceDir, "checkpoints"),
    legacyRepoIndexPath: path.join(legacyWorkspaceDir, "index.json")
  };
}

export async function ensureNanoCodinDirs(paths: NanoCodinPaths, cwd: string): Promise<void> {
  await mkdir(paths.homeDir, { recursive: true, mode: 0o700 });
  await mkdir(paths.workspacesDir, { recursive: true, mode: 0o700 });
  await mkdir(paths.workspaceStateDir, { recursive: true, mode: 0o700 });
  await writeFile(paths.workspaceMetaPath, `${JSON.stringify({
    workspaceId: paths.workspaceId,
    cwd: resolveWorkspacePath(cwd),
    updatedAt: Date.now()
  }, null, 2)}\n`, "utf8");
}
