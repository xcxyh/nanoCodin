import { randomUUID } from "node:crypto";
import { appendFile, link, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { SessionConflictError, type AgentEvent, type Session } from "../agent/session.js";

const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT";

export async function publish(file: string, text: string, replace = false) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, text, { mode: 0o600, flag: "wx" });
    if (replace) await rename(temporary, file);
    else await link(temporary, file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new SessionConflictError();
    throw error;
  } finally {
    await rm(temporary, { force: true });
  }
}

interface Segment {
  version: 1;
  start: number;
  owner: number | null;
  snapshot?: Session;
}

/** Each run exclusively claims the next segment. A killed writer leaves only its final line unfinished. */
export async function replay(directory: string, session: Session) {
  let names: string[];
  try { names = await readdir(directory); }
  catch (error) { if (!missing(error)) throw error; names = []; }
  const segments = names.filter(name => /^\d{10}\.jsonl$/.test(name)).sort();
  let owner: number | null = null;
  for (const [index, name] of segments.entries()) {
    if (Number(name.slice(0, 10)) !== index + 1) throw new SyntaxError("Missing session segment");
    const data = await readFile(path.join(directory, name), "utf8");
    const lines = data.slice(0, data.lastIndexOf("\n") + 1).split("\n");
    lines.pop();
    const header: Segment = JSON.parse(lines.shift() ?? "");
    if (!header || header.version !== 1 || header.start !== session.events.length ||
        !(header.owner === null || (Number.isSafeInteger(header.owner) && header.owner > 0))) throw new SyntaxError("Invalid session segment");
    if (header.snapshot) {
      if (!Array.isArray(header.snapshot.events)) throw new SyntaxError("Invalid journal snapshot");
      session = header.snapshot;
    }
    for (const line of lines) session.events.push(JSON.parse(line));
    owner = header.owner;
    if (session.events.at(-1)?.type === "finish" || names.includes(name + ".closed")) owner = null;
  }
  return { session, revision: segments.length, owner };
}

export function assertWriterAvailable(owner: number | null) {
  if (owner === null) return;
  try { process.kill(owner, 0); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return; }
  throw new SessionConflictError();
}

export async function startSegment(directory: string, revision: number, header: Segment, events: AgentEvent[]) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, String(revision + 1).padStart(10, "0") + ".jsonl");
  await publish(file, [JSON.stringify(header), ...events.map(event => JSON.stringify(event)), ""].join("\n"));
  return file;
}

export async function appendEvent(file: string, event: AgentEvent) {
  await appendFile(file, JSON.stringify(event) + "\n", { flag: "a" });
}
