import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentEvent, Session } from "./types.js";
import { canonicalPath } from "../core/paths.js";
import { resolveNanoCodinPaths } from "../config/paths.js";

const eventTypes = new Set(["user", "model_start", "model_end", "usage", "tool_start", "tool_end", "notice", "finish"]);
export type SessionLoadResult = { status: "ok"; session: Session } | { status: "not_found" | "invalid_id" | "corrupt" | "incompatible" | "wrong_workspace" | "unavailable"; message: string };
/** Optional atomic file adapter; failure diagnostics never modify the original record. */
export class FileSessionStore {
  readonly directory: string;
  private readonly cwd: string;
  constructor(cwd: string) {
    this.cwd = canonicalPath(cwd);
    this.directory = path.join(resolveNanoCodinPaths(this.cwd).workspaceStateDir, "sessions");
  }
  async save(session: Session): Promise<void> {
    if (!validId(session.id) || canonicalPath(session.cwd) !== this.cwd) throw new Error("Session does not belong to this workspace.");
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await atomicWrite(path.join(this.directory, `${session.id}.json`), `${JSON.stringify(session, null, 2)}\n`);
    await atomicWrite(path.join(this.directory, "latest"), session.id);
  }
  async load(id?: string): Promise<Session | null> {
    const result = await this.loadResult(id);
    return result.status === "ok" ? result.session : null;
  }
  async loadResult(id?: string): Promise<SessionLoadResult> {
    let selected = id;
    try {
      selected ??= (await readFile(path.join(this.directory, "latest"), "utf8")).trim();
      if (!validId(selected)) return { status: "invalid_id", message: "Invalid session ID or latest pointer." };
      const data = JSON.parse(await readFile(path.join(this.directory, `${selected}.json`), "utf8")) as Session;
      if (!data || typeof data !== "object") return { status: "corrupt", message: "Session record is not an object." };
      if (data.version !== 1) return { status: "incompatible", message: `Unsupported session version: ${data.version}` };
      if (typeof data.cwd !== "string" || !Array.isArray(data.events) || data.id !== selected || !Number.isFinite(data.createdAt)) return { status: "corrupt", message: "Session header or event list is invalid." };
      if (canonicalPath(data.cwd) !== this.cwd) return { status: "wrong_workspace", message: "Session belongs to another workspace." };
      if (data.events.some((event) => event && !eventTypes.has(event.type))) return { status: "incompatible", message: "Session contains unsupported event types." };
      const invalidUsage = data.events.filter((event) => event?.type === "usage" && !validEvent(event));
      data.events = data.events.filter((event) => event?.type !== "usage" || validEvent(event));
      if (!data.events.every(validEvent)) return { status: "corrupt", message: "Session contains invalid event data." };
      if (invalidUsage.length) data.events.push({ at: Date.now(), type: "notice", text: `忽略 ${invalidUsage.length} 条无效 token 用量记录；其他会话记录已保留。` });
      return { status: "ok", session: { ...data, cwd: this.cwd } };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { status: "not_found", message: `Session not found: ${selected ?? "latest"}` };
      if (error instanceof SyntaxError) return { status: "corrupt", message: "Session JSON is damaged." };
      return { status: "unavailable", message: `Session read failed: ${(error as Error).message}` };
    }
  }
  async list(): Promise<Array<{ id: string; task: string }>> {
    const files = await readdir(this.directory).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return [] as string[]; throw error; });
    const sessions = await Promise.all(files.filter((file) => file.endsWith(".json")).map((file) => this.load(file.slice(0, -5))));
    return sessions.filter((item): item is Session => item !== null).sort((a, b) => b.createdAt - a.createdAt).map((session) => ({ id: session.id, task: session.events.find((event) => event.type === "user")?.text ?? "" }));
  }
}
function validId(id: string): boolean { return /^[\w-]{1,128}$/.test(id); }
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0;
function validEvent(raw: unknown): raw is AgentEvent {
  if (!raw || typeof raw !== "object") return false;
  const event = raw as Record<string, any>;
  if (!finite(event.at) || !eventTypes.has(event.type)) return false;
  if (event.type === "user" || event.type === "notice") return typeof event.text === "string";
  if (event.type === "finish") return ["complete", "incomplete", "error", "cancelled"].includes(event.status) && typeof event.answer === "string";
  if (event.type === "model_start") return typeof event.requestId === "string" && Number.isInteger(event.round) && event.round > 0;
  if (event.type === "model_end") return typeof event.requestId === "string" && ["complete", "error", "cancelled"].includes(event.status);
  if (event.type === "usage") return event.usage && [event.usage.promptTokens, event.usage.completionTokens, event.usage.totalTokens].every(finite) && ["actual", "estimated", "mixed"].includes(event.usage.source);
  if (typeof event.callId !== "string" || !event.call || typeof event.call.name !== "string") return false;
  if (event.type === "tool_start") return event.mutates === undefined || typeof event.mutates === "boolean";
  const result = event.result;
  if (!result || typeof result.ok !== "boolean" || typeof result.output !== "string" || (result.reason !== undefined && !["denied", "cancelled", "timeout"].includes(result.reason))) return false;
  const effect = result.effects;
  if (!effect) return true;
  if (typeof effect !== "object" || [effect.changed, effect.uncertainChanges].some((value) => value !== undefined && typeof value !== "boolean")) return false;
  if (effect.changedFiles !== undefined && (!Array.isArray(effect.changedFiles) || !effect.changedFiles.every((value: unknown) => typeof value === "string"))) return false;
  if (effect.verificationCommands !== undefined && (!Array.isArray(effect.verificationCommands) || !effect.verificationCommands.every((value: unknown) => typeof value === "string"))) return false;
  if (effect.plan !== undefined && (!Array.isArray(effect.plan) || !effect.plan.every((item: any) => item && typeof item.text === "string" && ["pending", "in_progress", "completed"].includes(item.status)))) return false;
  const cmd = effect.command;
  return cmd === undefined || (cmd && typeof cmd.command === "string" && (cmd.exitCode === null || Number.isInteger(cmd.exitCode)) && typeof cmd.stdout === "string" && typeof cmd.stderr === "string" && finite(cmd.durationMs) && typeof cmd.verification === "boolean");
}
async function atomicWrite(file: string, data: string): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, data, { encoding: "utf8", mode: 0o600 }); await rename(temporary, file); }
  finally { await rm(temporary, { force: true }); }
}
