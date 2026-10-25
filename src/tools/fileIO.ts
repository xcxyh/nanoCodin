import { constants } from "node:fs";
import { open, lstat, writeFile, rename, rm, chmod } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { ToolExecutionError } from "../core/toolTypes.js";

export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const fileHash = (text: string | Uint8Array) => createHash("sha256").update(text).digest("hex");
export async function readTextFile(target: string, signal?: AbortSignal, maxBytes = MAX_FILE_BYTES) {
  signal?.throwIfAborted();
  let handle;
  try { handle = await open(target, constants.O_RDONLY | constants.O_NONBLOCK); }
  catch (error) { throw new ToolExecutionError((error as NodeJS.ErrnoException).code ?? "FILE_READ_FAILED", `Cannot read ${target}: ${(error as Error).message}`); }
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new ToolExecutionError("UNSUPPORTED_FILE", "Only regular text files are supported.");
    if (info.size > maxBytes) throw new ToolExecutionError("FILE_TOO_LARGE", `File exceeds ${maxBytes} bytes; use a narrower external reader.`);
    const chunks: Buffer[] = []; let size = 0;
    while (true) {
      signal?.throwIfAborted();
      const buffer = Buffer.alloc(Math.min(65536, maxBytes + 1 - size));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      signal?.throwIfAborted();
      if (!bytesRead) break;
      size += bytesRead;
      if (size > maxBytes) throw new ToolExecutionError("FILE_TOO_LARGE", `File grew beyond ${maxBytes} bytes during reading.`);
      chunks.push(buffer.subarray(0, bytesRead));
    }
    const bytes = Buffer.concat(chunks);
    if (bytes.includes(0)) throw new ToolExecutionError("UNSUPPORTED_FILE", "Binary content is not supported.");
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
    catch { throw new ToolExecutionError("UNSUPPORTED_FILE", "File is not valid UTF-8 text."); }
    return { text, hash: fileHash(bytes), info };
  } catch (error) {
    if (signal?.aborted) throw new ToolExecutionError("CANCELLED", "Read cancelled before any file modification.");
    throw error;
  } finally { await handle.close(); }
}
/** Guard a known version, then atomically replace a regular, single-link file. */
export async function replaceTextFile(target: string, original: Awaited<ReturnType<typeof readTextFile>>, text: string, signal?: AbortSignal) {
  if (Buffer.byteLength(text) > MAX_FILE_BYTES) throw new ToolExecutionError("FILE_TOO_LARGE", "Replacement exceeds 8 MiB.");
  const info = await lstat(target);
  if (!info.isFile() || info.nlink !== 1) throw new ToolExecutionError("UNSUPPORTED_FILE", "Editing symlinks, special files or hard-linked files is not supported.");
  if (!(info.mode & 0o222)) throw new ToolExecutionError("READ_ONLY", "File has no write permission bits.");
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, text, { encoding: "utf8", flag: "wx", mode: 0o600, signal });
    await chmod(temporary, info.mode & 0o777);
    const currentInfo = await lstat(target);
    const current = await readTextFile(target, signal);
    if (!currentInfo.isFile() || currentInfo.nlink !== 1 || currentInfo.ino !== original.info.ino || currentInfo.dev !== original.info.dev || currentInfo.mode !== info.mode || info.mode !== original.info.mode || current.hash !== original.hash) {
      throw new ToolExecutionError("VERSION_CONFLICT", "File changed since it was read. Read its current hash and retry explicitly.");
    }
    signal?.throwIfAborted();
    await rename(temporary, target);
  } catch (error) {
    if (signal?.aborted) throw new ToolExecutionError("CANCELLED", "Edit cancelled before replacing the target file.");
    if (error instanceof ToolExecutionError) throw error;
    throw new ToolExecutionError((error as NodeJS.ErrnoException).code ?? "FILE_WRITE_FAILED", (error as Error).message);
  } finally { await rm(temporary, { force: true }).catch(() => {}); }
}
