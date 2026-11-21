import { isDeepStrictEqual } from "node:util";
import { appendEvent, assertWriterAvailable, publish, replay, startSegment } from "./journal.js";
import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { SessionConflictError, type AppendEvent, type AgentEvent, type Session } from "../agent/session.js";
import { canonicalPath } from "../agent/workspace.js";
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
  private base(id: string) { return path.join(this.directory, `${id}.json`); }
  private journal(id: string) { return path.join(this.directory, `${id}.journal`); }
  private latest(id: string) { return publish(path.join(this.directory, "latest"), id, true); }

  private async initialize(session: Session) {
    if (!validId(session.id) || canonicalPath(session.cwd) !== this.cwd) throw new Error("Session does not belong to this workspace.");
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    try {
      await publish(this.base(session.id), JSON.stringify(session) + "\n");
      return true;
    } catch (error) {
      if (error instanceof SessionConflictError) return false;
      throw error;
    }
  }

  private async head(id: string) {
    const base = JSON.parse(await readFile(this.base(id), "utf8"));
    const validated = validate(base, id, this.cwd);
    if (validated.status !== "ok") return validated;
    const head = await replay(this.journal(id), validated.session);
    const result = validate(head.session, id, this.cwd);
    if (result.status !== "ok") return result;
    return { ...head, ...result };
  }

  /** The snapshot API continues to accept complete or replaced histories. */
  async save(session: Session): Promise<void> {
    if (!await this.initialize(session)) {
      const head = await this.head(session.id);
      if (head.status !== "ok") throw new Error(head.message);
      assertWriterAvailable(head.owner);
      const start = head.session.events.length;
      const extendsHistory = head.session.createdAt === session.createdAt && matchesStored(head.session.events, session.events.slice(0, start));
      if (!extendsHistory || session.events.length !== start) {
        await startSegment(this.journal(session.id), head.revision, {
          version: 1, owner: null, start, ...(extendsHistory ? {} : { snapshot: session })
        }, extendsHistory ? session.events.slice(start) : []);
      }
    }
    await this.latest(session.id);
  }

  /** One callback per Agent. Check the starting history once, then append only new events. */
  writer(): AppendEvent {
    let file: string | undefined;
    let interrupted = false;
    const append: AppendEvent = async (session, event) => {
      if (event.type === "user") {
        file = undefined;
        interrupted = false;
        const prior = { ...session, events: session.events.slice(0, -1) };
        // Publish a v1 base only for a new ID. Legacy snapshots stay intact.
        const initialized = await this.initialize({ ...prior, events: [] });
        const head = await this.head(session.id);
        if (head.status !== "ok") throw new Error(head.message);
        assertWriterAvailable(head.owner);
        if (initialized ? head.revision !== 0 : !matchesStored(head.session, prior)) throw new SessionConflictError();
        const initial = initialized ? [...prior.events, event] : [event];
        file = await startSegment(this.journal(session.id), head.revision, {
          version: 1, start: head.session.events.length, owner: process.pid
        }, initial);
        await this.latest(session.id);
      } else {
        if (!file) throw new Error("Session writer has no active run.");
        // A failed append can leave a partial line. Release this segment only once
        // the agent has stopped, so a concurrent resume cannot race a running tool.
        if (interrupted) {
          if (event.type === "finish") await publish(file + ".closed", "");
          return;
        }
        await appendEvent(file, event);
        if (event.type === "finish") {
          file = undefined;
          await this.latest(session.id);
        }
      }
    };
    return async (session, event) => {
      try { await append(session, event); }
      catch (error) {
        if (!interrupted && file && event.type === "finish") {
          await publish(file + ".closed", "").catch(() => {});
        }
        interrupted = true;
        throw error;
      }
    };
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
      const head = await this.head(selected);
      return head.status === "ok" ? { status: "ok", session: head.session } : head;
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
function validate(data: Session, selected: string, cwd: string): SessionLoadResult {
  if (!data || typeof data !== "object") return { status: "corrupt", message: "Session record is not an object." };
  if (data.version !== 1) return { status: "incompatible", message: `Unsupported session version: ${data.version}` };
  if (typeof data.cwd !== "string" || !Array.isArray(data.events) || data.id !== selected || !Number.isFinite(data.createdAt)) return { status: "corrupt", message: "Session header or event list is invalid." };
  if (canonicalPath(data.cwd) !== cwd) return { status: "wrong_workspace", message: "Session belongs to another workspace." };
  if (data.events.some((event) => event && !eventTypes.has(event.type))) return { status: "incompatible", message: "Session contains unsupported event types." };
  const invalidUsage = data.events.filter((event) => event?.type === "usage" && !validEvent(event));
  data.events = data.events.filter((event) => event?.type !== "usage" || validEvent(event));
  if (!data.events.every(validEvent)) return { status: "corrupt", message: "Session contains invalid event data." };
  if (invalidUsage.length) data.events.push({ at: data.createdAt, type: "notice", text: `忽略 ${invalidUsage.length} 条无效 token 用量记录；其他会话记录已保留。` });
  return { status: "ok", session: { ...data, cwd } };
}

// Optional properties with value undefined disappear in the on-disk JSON.
function matchesStored(stored: unknown, live: unknown) {
  return isDeepStrictEqual(stored, JSON.parse(JSON.stringify(live)));
}
