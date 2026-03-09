#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { render } from "ink";
import React from "react";
import { CodingAgentGraph } from "./agent/agentGraph.js";
import { createModelProviderFromEnv } from "./llm/modelRouter.js";
import type { ToolContext } from "./core/toolTypes.js";
import { createDefaultToolRegistry } from "./tools/registry.js";
import { ConsoleApp } from "./ui/consoleApp.js";
import { loadRuntimeConfig } from "./services/configLoader.js";
import { RepoIndexer } from "./services/repoIndexer.js";

function parsePositiveIntEnv(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildRuntimeEnv(filePath: string): NodeJS.ProcessEnv {
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

function main() {
  Object.assign(process.env, buildRuntimeEnv(path.resolve(process.cwd(), ".env")));

  const runtime = loadRuntimeConfig(process.cwd());
  const model = createModelProviderFromEnv();
  const repoIndexer = new RepoIndexer(process.cwd(), runtime.config.repoIndex);
  const tools = createDefaultToolRegistry();
  const maxSteps = runtime.config.agent.maxSteps ?? parsePositiveIntEnv(process.env.AGENT_MAX_STEPS, 12);
  const recursionLimit = runtime.config.agent.recursionLimit ?? parsePositiveIntEnv(process.env.AGENT_RECURSION_LIMIT, maxSteps * 2 + 8);

  const toolContext: ToolContext = {
    cwd: process.cwd(),
    todos: { items: [] },
    runtimeConfig: runtime.config,
    repoIndex: repoIndexer,
    commandLogs: [],
    workingMemory: null
  };

  void repoIndexer.init().catch(() => undefined).finally(() => {
    const graph = new CodingAgentGraph(model, tools, toolContext, maxSteps, recursionLimit);
    render(React.createElement(ConsoleApp, { graph }));
  });
}

main();
