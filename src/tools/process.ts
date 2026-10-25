import { execFile } from "node:child_process";
import type { ToolContext } from "../core/toolTypes.js";
import { execa } from "execa";

// execa skips exit cleanup for detached processes. Share hooks only while groups
// exist, and preserve host signal handlers (including the CLI's SIGINT cancel).
const activeGroups = new Set<number>();
let removeExitHooks: (() => void) | undefined;
function trackGroup(pid: number): () => void {
  activeGroups.add(pid);
  if (!removeExitHooks) {
    const cleanup = () => {
      for (const group of activeGroups) {
        try { process.kill(-group, "SIGKILL"); } catch { /* Group may already have exited. */ }
      }
      activeGroups.clear();
    };
    const handlers = (["SIGINT", "SIGTERM", "SIGHUP"] as const).map((signal) => {
      const hostHandlesSignal = process.listenerCount(signal) > 0;
      const handler = () => {
        const handledElsewhere = hostHandlesSignal || process.listenerCount(signal) > 1;
        cleanup();
        removeExitHooks?.();
        if (!handledElsewhere) process.kill(process.pid, signal);
      };
      process.on(signal, handler);
      return { signal, handler };
    });
    process.on("exit", cleanup);
    removeExitHooks = () => {
      process.removeListener("exit", cleanup);
      for (const { signal, handler } of handlers) process.removeListener(signal, handler);
      removeExitHooks = undefined;
    };
  }
  return () => { activeGroups.delete(pid); if (!activeGroups.size) removeExitHooks?.(); };
}

/** Keep a UTF-8 tail without introducing a replacement character at its boundary. */
export function outputTail(text: string, maxBytes: number): string {
  const bytes = Buffer.from(text);
  let start = Math.max(0, bytes.length - maxBytes);
  while (start < bytes.length && (bytes[start] & 0xc0) === 0x80) start++;
  return bytes.subarray(start).toString("utf8");
}

/** Own the shell's process group so cancellation and timeout also stop its children. */
export async function runShell(command: string, cwd: string, timeoutMs: number, signal?: AbortSignal, onOutput?: ToolContext["onOutput"], maxOutputBytes = 8192) {
  signal?.throwIfAborted();
  const grouped = process.platform !== "win32";
  const child = execa("bash", ["-lc", command], { cwd, detached: grouped, reject: false, buffer: false });
  const tails = { stdout: "", stderr: "" };
  const dirty = new Set<"stdout" | "stderr">();
  let outputTimer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    if (outputTimer) clearTimeout(outputTimer);
    outputTimer = undefined;
    for (const stream of dirty) {
      try { void Promise.resolve(onOutput?.({ stream, text: tails[stream] })).catch(() => {}); } catch { /* Observers are optional. */ }
    }
    dirty.clear();
  };
  const capture = (stream: "stdout" | "stderr", text: string) => {
    tails[stream] = outputTail(tails[stream] + text, maxOutputBytes);
    dirty.add(stream);
    if (!outputTimer) outputTimer = setTimeout(flush, 100);
  };
  child.stdout?.setEncoding("utf8").on("data", (text: string) => capture("stdout", text));
  child.stderr?.setEncoding("utf8").on("data", (text: string) => capture("stderr", text));
  const releaseGroup = grouped && child.pid ? trackGroup(child.pid) : undefined;
  let stopped: "cancelled" | "timed out" | undefined;
  let forceKill: ReturnType<typeof setTimeout> | undefined;
  let windowsCleanup: Promise<void> | undefined;
  const killGroup = (killSignal: NodeJS.Signals) => {
    if (!child.pid) return;
    try { process.kill(-child.pid, killSignal); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") child.kill(killSignal); }
  };
  const stop = (reason: typeof stopped) => {
    if (stopped) return;
    stopped = reason;
    if (grouped) {
      killGroup("SIGTERM");
      forceKill = setTimeout(() => killGroup("SIGKILL"), 250);
    } else if (child.pid) {
      windowsCleanup = new Promise((resolve) => {
        execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"], () => { child.kill(); resolve(); });
      });
    }
  };
  const cancel = () => stop("cancelled");
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  const timeout = setTimeout(() => stop("timed out"), timeoutMs);
  try {
    const result = await child;
    return { result, stopped, stdout: tails.stdout.replace(/\r?\n$/, ""), stderr: tails.stderr.replace(/\r?\n$/, "") };
  } finally {
    flush();
    clearTimeout(timeout);
    if (forceKill) clearTimeout(forceKill);
    // The shell can exit before a TERM-resistant child closes its own descriptors.
    if (stopped && grouped) killGroup("SIGKILL");
    await windowsCleanup;
    signal?.removeEventListener("abort", cancel);
    releaseGroup?.();
  }
}
