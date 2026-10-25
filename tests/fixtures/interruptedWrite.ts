import { writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { createAgent } from "../../src/api.js";
import { FileSessionStore } from "../../src/session/store.js";
import { createDefaultTools } from "../../src/tools/index.js";
import { DEFAULT_RUNTIME_CONFIG } from "../../src/core/runtimeConfig.js";

const cwd = process.argv[2];
const store = new FileSessionStore(cwd);
const tools = createDefaultTools({ ...DEFAULT_RUNTIME_CONFIG.sandbox, defaultPolicy: "allow" });
tools.push({ name: "interrupted_write", description: "Crash fixture", mutates: true, schema: z.object({}), async execute() {
  await writeFile(path.join(cwd, "source.js"), "export const = BROKEN");
  process.stdout.write("WRITTEN\n");
  await new Promise((resolve) => setTimeout(resolve, 30_000));
  return { ok: true, output: "written", effects: { changedFiles: ["source.js"] } };
} });
let round = 0;
const calls = [
  { name: "create", input: { path: "source.js", content: "export const answer = 42;" } },
  { name: "bash", input: { command: "node --check source.js", purpose: "verify" } },
  { name: "interrupted_write", input: {} }
];
await createAgent({ cwd, tools, save: (current) => store.save(current), model: {
  async generate() { return { text: "", toolCalls: [calls[round++]] }; }
} }).run("edit and check");
