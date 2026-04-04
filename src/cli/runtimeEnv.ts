import { existsSync, readFileSync } from "node:fs";

export function parsePositiveIntEnv(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function buildRuntimeEnv(filePath: string): NodeJS.ProcessEnv {
  const runtimeEnv: NodeJS.ProcessEnv = { ...process.env };

  if (!existsSync(filePath)) {
    return runtimeEnv;
  }

  const text = readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) {
      continue;
    }

    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim();
    if (!(key in runtimeEnv)) {
      runtimeEnv[key] = value;
    }
  }

  return runtimeEnv;
}
