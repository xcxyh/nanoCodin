#!/usr/bin/env node
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "./cli/runCli.js";
export { buildRuntimeEnv, parsePositiveIntEnv } from "./cli/runtimeEnv.js";

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  return runCli(argv);
}

export function isDirectExecution(metaUrl: string, argv1 = process.argv[1]): boolean {
  if (!argv1) {
    return false;
  }

  try {
    const resolvedModulePath = realpathSync(fileURLToPath(metaUrl));
    const resolvedArgvPath = realpathSync(path.resolve(argv1));
    return resolvedModulePath === resolvedArgvPath;
  } catch {
    return false;
  }
}

const isDirectExecutionEntry = isDirectExecution(import.meta.url);

if (isDirectExecutionEntry) {
  void main().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
