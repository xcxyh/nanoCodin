import { realpathSync } from "node:fs";
import path from "node:path";
export function canonicalPath(cwd: string): string {
  try { return realpathSync(cwd); } catch { return path.resolve(cwd); }
}
