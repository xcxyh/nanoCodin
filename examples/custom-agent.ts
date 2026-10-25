import { z } from "zod";
import { createAgent, defineTool, type Model } from "../src/api.js";

// No model key, config file, terminal UI or filesystem tools are needed to use the Harness.
const add = defineTool({
  name: "add", description: "Add two numbers", schema: z.object({ a: z.number(), b: z.number() }),
  async execute({ a, b }) { return { ok: true, output: String(a + b) }; }
});
let first = true;
const model: Model = {
  async generate(messages) {
    if (first) { first = false; return { text: "", toolCalls: [{ name: "add", input: { a: 2, b: 3 } }] }; }
    return { text: messages.at(-1)?.content.includes("OK: 5") ? "2 + 3 = 5" : "未取得结果" };
  }
};
const agent = createAgent({ model, tools: [add], instructions: "Use the add tool to calculate." });
const result = await agent.run("计算 2 + 3");
console.log(result.answer);
