import { realpath, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createAgent } from "../../src/api.js";
import { createTemplateInstructions, createTemplateRenderer } from "../../src/templates/index.js";

describe("optional Handlebars prompt adapter", () => {
  it("supports conditions, loops and plaintext code without HTML escaping", () => {
    const render = createTemplateRenderer();
    expect(render('{{#if rules}}{{rules}}{{/if}}\n{{#each tools}}{{name}}: {{description}}\n{{/each}}', {
      rules: 'const x = "<tag>" && a < b;', tools: [{ name: "view", description: "读取文件 & 目录" }]
    })).toBe('const x = "<tag>" && a < b;\nview: 读取文件 & 目录\n');
  });
  it("isolates helpers and partials between adapters", () => {
    const one = createTemplateRenderer({ helpers: { custom: (value) => String(value).toUpperCase() }, partials: { body: "{{custom name}}" } });
    expect(one("{{> body}}", { name: "first" })).toBe("FIRST");
    const two = createTemplateRenderer();
    expect(() => two("{{custom name}}", { name: "second" })).toThrow();
  });
  it("injects template data through instructions without coupling the core to Handlebars", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "nanocodin-template-"));
    const file = path.join(cwd, "system.hbs");
    await writeFile(file, "Task: {{task}}\nRules: {{rules}}");
    const prompts: string[] = [];
    const agent = createAgent({ cwd, instructions: createTemplateInstructions({ file, data: async () => ({ rules: 'keep "quotes" <plain>' }) }),
      model: { async generate(messages) { prompts.push(messages[0].content); return { text: "完成" }; } } });
    await agent.run("first");
    await writeFile(file, "Updated: {{task}} / {{cwd}}");
    await agent.run("second");
    expect(prompts[0]).toBe('Task: first\nRules: keep "quotes" <plain>');
    expect(prompts[1]).toBe(`Updated: second / ${await realpath(cwd)}`);
  });
  it("reports the source path for broken or missing templates", async () => {
    const agent = createAgent({ instructions: createTemplateInstructions({ file: "/missing/prompt.hbs" }), model: { async generate() { return { text: "unused" }; } } });
    const result = await agent.run("task");
    expect(result.status).toBe("error");
    expect(result.answer).toContain("/missing/prompt.hbs");
  });
  it("renders bundled project rules and skills without empty optional sections", async () => {
    const source = await readFile(new URL("../../src/prompts/system.hbs", import.meta.url), "utf8");
    const render = createTemplateRenderer();
    expect(render(source, {})).not.toContain("Project rules (AGENTS.md):");
    const output = render(source, { projectRules: 'keep "quotes"', selectedSkills: [{ name: "review", path: "/skill.md", content: "<review> & check" }] });
    expect(output).toContain('keep "quotes"');
    expect(output).toContain("Skill $review (/skill.md):\n<review> & check");
    expect(output).not.toContain("&quot;");
  });
});
