import os from "node:os";
import path from "node:path";
import { access, readFile, readdir } from "node:fs/promises";
import { resolveNanoCodinHome } from "./userPaths.js";

export type SkillSourceScope = "workspace" | "nanocodin_home" | "agents_home";

export interface SkillSearchRoot {
  dir: string;
  sourceScope: SkillSourceScope;
}

export interface LoadedSkill {
  name: string;
  description: string;
  sourcePath: string;
  sourceScope: SkillSourceScope;
  command: string;
}

const PROMPT_DESCRIPTION_LIMIT = 240;
const LIST_DESCRIPTION_LIMIT = 120;

export function resolveSkillSearchRoots(cwd: string, env: NodeJS.ProcessEnv = process.env): SkillSearchRoot[] {
  return [
    {
      dir: path.join(cwd, ".agents", "skills"),
      sourceScope: "workspace"
    },
    {
      dir: path.join(resolveNanoCodinHome(env), "skills"),
      sourceScope: "nanocodin_home"
    },
    {
      dir: path.join(os.homedir(), ".agents", "skills"),
      sourceScope: "agents_home"
    }
  ];
}

export async function loadSkills(cwd: string, env: NodeJS.ProcessEnv = process.env): Promise<LoadedSkill[]> {
  return discoverSkills(resolveSkillSearchRoots(cwd, env));
}

export async function discoverSkills(searchRoots: SkillSearchRoot[]): Promise<LoadedSkill[]> {
  const loadedSkills: LoadedSkill[] = [];
  const seenNames = new Set<string>();

  for (const root of searchRoots) {
    const skillFilePaths = await listSkillFilePaths(root.dir);
    for (const skillFilePath of skillFilePaths) {
      const skill = await readSkillFile(skillFilePath, root.sourceScope);
      if (!skill || seenNames.has(skill.name)) {
        continue;
      }
      seenNames.add(skill.name);
      loadedSkills.push(skill);
    }
  }

  return loadedSkills;
}

async function listSkillFilePaths(rootDir: string): Promise<string[]> {
  try {
    await access(rootDir);
  } catch {
    return [];
  }

  const entries = await readdir(rootDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(rootDir, entry.name, "SKILL.md"));
}

async function readSkillFile(skillFilePath: string, sourceScope: SkillSourceScope): Promise<LoadedSkill | null> {
  try {
    const text = await readFile(skillFilePath, "utf8");
    const parsed = parseSkillFile(text, skillFilePath);
    return {
      ...parsed,
      sourcePath: skillFilePath,
      sourceScope,
      command: `/${parsed.name}`
    };
  } catch {
    return null;
  }
}

export function parseSkillFile(text: string, skillFilePath: string): Pick<LoadedSkill, "name" | "description"> {
  const fallbackName = path.basename(path.dirname(skillFilePath));
  const frontmatter = parseFrontmatter(text);
  const name = normalizeFrontmatterValue(frontmatter.name) || fallbackName;
  const description = normalizeFrontmatterValue(frontmatter.description) || "";

  return {
    name,
    description
  };
}

export function normalizeSkillDescription(description: string): string {
  return description.replace(/\s+/g, " ").trim();
}

export function truncateSkillDescription(description: string, maxLength: number): string {
  if (description.length <= maxLength) {
    return description;
  }

  return `${description.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function formatSkillDescriptionForList(description: string): string {
  return truncateSkillDescription(normalizeSkillDescription(description), LIST_DESCRIPTION_LIMIT);
}

export function formatSkillsForPrompt(skills: LoadedSkill[]): string {
  if (skills.length === 0) {
    return "(none)";
  }

  return skills.map((skill) => {
    const description = truncateSkillDescription(normalizeSkillDescription(skill.description), PROMPT_DESCRIPTION_LIMIT) || "(no description)";
    return `- $${skill.name} | ${description} | ${skill.sourcePath}`;
  }).join("\n");
}

function parseFrontmatter(text: string): Record<string, string> {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    return {};
  }

  const result: Record<string, string> = {};
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";
    if (line === "---") {
      return result;
    }

    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (key) {
      result[key] = value;
    }
  }

  return {};
}

function normalizeFrontmatterValue(value: string | undefined): string {
  if (!value) {
    return "";
  }

  return value.replace(/^['"]|['"]$/g, "").trim();
}
