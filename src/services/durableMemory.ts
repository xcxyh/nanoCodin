import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DurableMemory, DurableMemoryEntry } from "../core/toolTypes.js";
import { resolveNanoCodinPaths } from "./userPaths.js";

function normalizeEntry(entry: unknown): DurableMemoryEntry | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const record = entry as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : null;
  const kind = record.kind;
  const content = typeof record.content === "string" ? record.content.trim() : "";
  if (!id || (kind !== "decision" && kind !== "pitfall" && kind !== "preference" && kind !== "workspace_fact") || !content) {
    return null;
  }
  const createdAt = typeof record.createdAt === "number" ? record.createdAt : Date.now();
  const updatedAt = typeof record.updatedAt === "number" ? record.updatedAt : createdAt;
  const tags = Array.isArray(record.tags) ? record.tags.filter((item): item is string => typeof item === "string") : [];
  return { id, kind, content, tags, createdAt, updatedAt };
}

export async function loadDurableMemory(cwd: string): Promise<DurableMemory> {
  const paths = resolveNanoCodinPaths(cwd);
  let entries: DurableMemoryEntry[] = [];
  if (existsSync(paths.durableMemoryPath)) {
    try {
      const text = await readFile(paths.durableMemoryPath, "utf8");
      const parsed = JSON.parse(text) as { entries?: unknown };
      entries = Array.isArray(parsed.entries)
        ? parsed.entries.map((entry) => normalizeEntry(entry)).filter((entry): entry is DurableMemoryEntry => entry !== null)
        : [];
    } catch {
      entries = [];
    }
  }

  let legacyText: string | null = null;
  const legacyPath = existsSync(paths.memoryPath) ? paths.memoryPath : paths.legacyMemoryPath;
  if (existsSync(legacyPath)) {
    try {
      const text = (await readFile(legacyPath, "utf8")).trim();
      legacyText = text.length > 0 ? text : null;
    } catch {
      legacyText = null;
    }
  }

  return { entries, legacyText };
}

export class DurableMemoryStore {
  private readonly filePath: string;

  constructor(cwd: string) {
    this.filePath = resolveNanoCodinPaths(cwd).durableMemoryPath;
  }

  async load(): Promise<DurableMemory> {
    return loadDurableMemoryFromPath(this.filePath);
  }

  async save(memory: DurableMemory): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify({ entries: memory.entries }, null, 2)}\n`, "utf8");
  }

  async upsert(entry: DurableMemoryEntry): Promise<DurableMemory> {
    const current = await this.load();
    const existingIndex = current.entries.findIndex((item) => item.kind === entry.kind && item.content === entry.content);
    const nextEntries = [...current.entries];
    if (existingIndex >= 0) {
      const existing = nextEntries[existingIndex]!;
      nextEntries[existingIndex] = {
        ...existing,
        tags: Array.from(new Set([...existing.tags, ...entry.tags])),
        updatedAt: entry.updatedAt
      };
    } else {
      nextEntries.push(entry);
    }
    const next = { ...current, entries: nextEntries.slice(-200) };
    await this.save(next);
    return next;
  }

  async remove(kind: DurableMemoryEntry["kind"], content: string): Promise<DurableMemory> {
    const current = await this.load();
    const next = {
      ...current,
      entries: current.entries.filter((entry) => !(entry.kind === kind && entry.content === content))
    };
    await this.save(next);
    return next;
  }
}

async function loadDurableMemoryFromPath(filePath: string): Promise<DurableMemory> {
  if (!existsSync(filePath)) {
    return { entries: [], legacyText: null };
  }
  try {
    const text = await readFile(filePath, "utf8");
    const parsed = JSON.parse(text) as { entries?: unknown };
    const entries = Array.isArray(parsed.entries)
      ? parsed.entries.map((entry) => normalizeEntry(entry)).filter((entry): entry is DurableMemoryEntry => entry !== null)
      : [];
    return { entries, legacyText: null };
  } catch {
    return { entries: [], legacyText: null };
  }
}
