import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentEvent, Session } from "./types.js";
import { resolveNanoCodinPaths } from "../config/paths.js";

const eventTypes = new Set(["user", "usage", "tool_start", "tool_end", "notice", "finish"]);
/** Optional local adapter. The Harness only knows its save(session) callback. */
export class FileSessionStore {
  readonly directory: string;
  constructor(private readonly cwd: string) {
    this.directory = path.join(resolveNanoCodinPaths(cwd).workspaceStateDir, "sessions");
  }
  async save(session: Session): Promise<void> {
    if (!validId(session.id) || path.resolve(session.cwd) !== path.resolve(this.cwd)) throw new Error("Session does not belong to this workspace.");
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await atomicWrite(path.join(this.directory, `${session.id}.json`), `${JSON.stringify(session, null, 2)}\n`);
    await atomicWrite(path.join(this.directory, "latest"), session.id);
  }
  async load(id?: string): Promise<Session | null> {
    const selected = id ?? (await readFile(path.join(this.directory, "latest"), "utf8").catch(() => "")).trim();
    if (!validId(selected)) return null;
    try {
      const data = JSON.parse(await readFile(path.join(this.directory, `${selected}.json`), "utf8")) as Session;
      if (data.version !== 1 || data.id !== selected || path.resolve(data.cwd) !== path.resolve(this.cwd) || !Array.isArray(data.events) || !data.events.every(validEvent)) return null;
      return data;
    } catch { return null; }
  }
  async list(): Promise<Array<{ id: string; task: string }>> {
    const files = await readdir(this.directory).catch(() => [] as string[]);
    const sessions = await Promise.all(files.filter((file) => file.endsWith(".json")).map((file) => this.load(file.slice(0, -5))));
    return sessions.filter((item): item is Session => item !== null).sort((a, b) => b.createdAt - a.createdAt).map((session) => ({ id: session.id, task: session.events.find((event) => event.type === "user")?.text ?? "" }));
  }
}
function validId(id: string): boolean { return /^[\w-]+$/.test(id); }
function validEvent(raw: unknown): raw is AgentEvent {
  if (!raw || typeof raw !== "object") return false;
  const event = raw as Record<string, any>;
  if (typeof event.at !== "number" || !eventTypes.has(event.type)) return false;
  if (event.type === "user" || event.type === "notice") return typeof event.text === "string";
  if (event.type === "finish") return ["complete", "incomplete", "error", "cancelled"].includes(event.status) && typeof event.answer === "string";
  if (event.type === "usage") return event.usage && typeof event.usage.totalTokens === "number";
  return typeof event.callId === "string" && event.call && typeof event.call.name === "string" && (event.type === "tool_start" || (event.result && typeof event.result.ok === "boolean" && typeof event.result.output === "string"));
}
async function atomicWrite(file: string, data: string): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, data, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, file);
  } finally { await rm(temporary, { force: true }); }
}
