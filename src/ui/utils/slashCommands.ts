import { formatSkillDescriptionForList, type LoadedSkill, type SkillSourceScope } from "../../services/skills.js";

export type SlashCommandSourceScope = SkillSourceScope | "builtin";

export interface SlashCommandItem {
  kind: "builtin" | "skill";
  name: string;
  description: string;
  command: string;
  sourceScope: SlashCommandSourceScope;
  sourcePath?: string;
}

export interface ResolvedSlashSubmission {
  kind: "builtin" | "task";
  task?: string;
  commandName?: string;
}

export function buildSlashCommands(skills: LoadedSkill[]): SlashCommandItem[] {
  return [
    {
      kind: "builtin",
      name: "clear",
      description: "Clear visible transcript and session context.",
      command: "/clear",
      sourceScope: "builtin"
    },
    {
      kind: "builtin",
      name: "quit",
      description: "Quit the TUI.",
      command: "/quit",
      sourceScope: "builtin"
    },
    ...skills.map((skill) => ({
      kind: "skill" as const,
      name: skill.name,
      description: formatSkillDescriptionForList(skill.description),
      command: skill.command,
      sourceScope: skill.sourceScope,
      sourcePath: skill.sourcePath
    }))
  ];
}

export function filterSlashCommands(commands: SlashCommandItem[], query: string): SlashCommandItem[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return commands;
  }

  return commands.filter((command) =>
    command.name.toLowerCase().includes(normalizedQuery) ||
    command.description.toLowerCase().includes(normalizedQuery)
  );
}

export function getSlashCommandQuery(input: string, cursor: number): string | null {
  const match = input.match(/^(\s*)\/([^\s]*)/);
  if (!match) {
    return null;
  }

  const slashIndex = match[1].length;
  const queryStart = slashIndex + 1;
  const queryEnd = queryStart + match[2].length;
  if (cursor < queryStart || cursor > queryEnd) {
    return null;
  }

  const remainder = input.slice(queryEnd);
  if (remainder.trim().length > 0) {
    return null;
  }

  return match[2];
}

export function buildSlashCommandTemplate(command: SlashCommandItem): string {
  return `${command.command} `;
}

export function resolveSlashSubmission(input: string, commands: SlashCommandItem[]): ResolvedSlashSubmission {
  const match = input.match(/^\s*\/([^\s]+)(?:\s+(.*))?$/s);
  if (!match) {
    return {
      kind: "task",
      task: input
    };
  }

  const commandName = match[1];
  const remainder = match[2] ?? "";
  const command = commands.find((candidate) => candidate.name === commandName);
  if (!command) {
    return {
      kind: "task",
      task: input
    };
  }

  if (command.kind === "builtin") {
    return {
      kind: "builtin",
      commandName
    };
  }

  const suffix = remainder.length > 0 ? ` ${remainder}` : "";
  return {
    kind: "task",
    task: `$${commandName}${suffix}`
  };
}
