#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { runCli } from "./cli/runCli.js";
export { buildRuntimeEnv, parsePositiveIntEnv } from "./cli/runtimeEnv.js";

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  return runCli(argv);
}

const isDirectExecution = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isDirectExecution) {
  void main().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
