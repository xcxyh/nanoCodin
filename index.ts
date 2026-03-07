import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { render } from "ink";
import React from "react";
import { CodingAgentGraph } from "./agent/agentGraph.js";
import { createModelProviderFromEnv } from "./llm/modelRouter.js";
import type { ToolContext } from "./core/toolTypes.js";
import { createDefaultToolRegistry } from "./tools/registry.js";
import { ConsoleApp } from "./ui/consoleApp.js";

function loadDotEnv(filePath: string) {
  if (!existsSync(filePath)) {
    return;
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
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function main() {
  loadDotEnv(path.resolve(process.cwd(), ".env"));

  const model = createModelProviderFromEnv();
  const tools = createDefaultToolRegistry();

  const toolContext: ToolContext = {
    cwd: process.cwd(),
    todos: { items: [] }
  };

  const graph = new CodingAgentGraph(model, tools, toolContext, 12);

  render(<ConsoleApp graph={graph} />);
}

main();
