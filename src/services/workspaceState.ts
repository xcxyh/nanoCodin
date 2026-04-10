import { ensureNanoCodinDirs, resolveNanoCodinPaths, type NanoCodinPaths } from "./userPaths.js";

export async function ensureWorkspaceState(cwd: string, env: NodeJS.ProcessEnv = process.env): Promise<NanoCodinPaths> {
  const paths = resolveNanoCodinPaths(cwd, env);
  await ensureNanoCodinDirs(paths, cwd);
  return paths;
}
