import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { Session } from "../session/types.js";
import { resolveNanoCodinPaths } from "../config/paths.js";
import { formatSkillsForPrompt, loadSkills } from "./skills.js";

export function resolveContextFilePaths(cwd: string) {
  const paths = resolveNanoCodinPaths(cwd);
  return {
    agentsPath: paths.agentsPath,
    contextPath: existsSync(paths.contextPath) ? paths.contextPath : paths.legacyContextPath,
    memoryPath: existsSync(paths.memoryPath) ? paths.memoryPath : paths.legacyMemoryPath
  };
}
async function optional(filePath: string): Promise<string> {
  return readFile(filePath, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
}

export interface ProjectContext {
  cwd: string;
  task: string;
  projectRules: string;
  projectContext: string;
  workspaceNotes: string;
  availableSkills: string;
  selectedSkills: Array<{ name: string; path: string; content: string }>;
}

/** Context data stays independent of any template engine. */
export async function loadProjectContext(cwd: string, task: string, session?: Session): Promise<ProjectContext> {
  const paths = resolveContextFilePaths(cwd);
  const skills = await loadSkills(cwd);
  const currentTask = /^(continue|继续)$/i.test(task.trim()) && session
    ? session.events.filter((event) => event.type === "user" && !event.continuation).at(-1) : undefined;
  const request = `${currentTask?.type === "user" ? currentTask.text : ""}\n${task}`;
  const invoked = new Set([...request.matchAll(/(?:^|\s)[$/]([\p{L}\p{N}_.:-]+)(?![\p{L}\p{N}_./:-])/gu)].map((match) => match[1]));
  const selected = skills.filter((skill) => invoked.has(skill.name));
  const [rules, context, notes] = await Promise.all([optional(paths.agentsPath), optional(paths.contextPath), optional(paths.memoryPath)]);
  const selectedSkills = await Promise.all(selected.map(async (skill) => ({
    name: skill.name, path: skill.sourcePath, content: await readFile(skill.sourcePath, "utf8")
  })));
  return { cwd, task, projectRules: rules, projectContext: context, workspaceNotes: notes,
    availableSkills: skills.length ? formatSkillsForPrompt(skills) : "", selectedSkills };
}

/** Plain instructions remain available to consumers who do not use Handlebars. */
export async function loadProjectInstructions(cwd: string, task: string, session?: Session): Promise<string> {
  const data = await loadProjectContext(cwd, task, session);
  return [
    data.projectRules && `Project rules (AGENTS.md):\n${data.projectRules}`,
    data.projectContext && `Project context:\n${data.projectContext}`,
    data.workspaceNotes && `Read-only project notes:\n${data.workspaceNotes}`,
    data.availableSkills && `Available skills (invoke $name):\n${data.availableSkills}`,
    ...data.selectedSkills.map((skill) => `Skill $${skill.name} (${skill.path}):\n${skill.content}`)
  ].filter(Boolean).join("\n\n");
}
