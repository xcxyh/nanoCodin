import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Handlebars from "handlebars";

const PROMPT_DIR = path.dirname(fileURLToPath(import.meta.url));

const cache = new Map<string, Handlebars.TemplateDelegate>();

async function loadTemplate(name: string): Promise<Handlebars.TemplateDelegate> {
  if (cache.has(name)) {
    return cache.get(name)!;
  }

  const filePath = path.join(PROMPT_DIR, `${name}.hbs`);
  const source = await readFile(filePath, "utf8");
  const compiled = Handlebars.compile(source);
  cache.set(name, compiled);
  return compiled;
}

export async function renderTemplate(name: "system" | "react", variables: Record<string, unknown>): Promise<string> {
  const template = await loadTemplate(name);
  return template(variables);
}
