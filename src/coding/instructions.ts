import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadProjectContext } from "../context/project.js";
import { resolveNanoCodinHome } from "../config/paths.js";
import { createTemplateInstructions } from "../templates/index.js";

export function codingInstructions(cwd: string) {
  const templateFile = [
    path.join(cwd, ".nanocodin", "prompts", "system.hbs"),
    path.join(resolveNanoCodinHome(), "prompts", "system.hbs")
  ].find((file) => existsSync(file)) ?? fileURLToPath(new URL("../prompts/system.hbs", import.meta.url));
  return createTemplateInstructions({
    file: templateFile,
    data: (task, current) => loadProjectContext(cwd, task, current)
  });
}
