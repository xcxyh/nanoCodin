import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { createAgent, projectSession, requireVerification } from "../../src/api.js";
import { FileSessionStore } from "../../src/session/store.js";

it("recovers a real crash after a write without trusting old checks or replaying the write", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "nanocodin-crash-"));
  const priorHome = process.env.NANOCODIN_HOME;
  const home = path.join(cwd, "home");
  const fixture = fileURLToPath(new URL("../fixtures/interruptedWrite.ts", import.meta.url));
  const child = spawn(process.execPath, ["--import", "tsx", fixture, cwd], {
    env: { ...process.env, NANOCODIN_HOME: home }, stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = ""; child.stderr.on("data", (chunk) => { stderr += chunk; });
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      let stdout = "";
      child.stdout.on("data", (chunk) => { stdout += chunk; if (stdout.includes("WRITTEN")) resolve(); });
      child.once("error", reject);
      child.once("exit", (code) => reject(new Error(`Unexpected child exit ${code}: ${stderr}`)));
      deadline = setTimeout(() => reject(new Error("Crash fixture did not reach its write.")), 5000);
    });
    const exited = once(child, "exit"); child.kill("SIGKILL"); await exited;
    process.env.NANOCODIN_HOME = home;
    const store = new FileSessionStore(cwd);
    const session = await store.load();
    expect(session).not.toBeNull();
    expect(projectSession(session!)).toMatchObject({ changed: true, verified: false, pending: { mutates: true } });
    const result = await createAgent({ session: session!, beforeFinish: requireVerification, maxSteps: 1,
      model: { async generate() { return { text: "done" }; } }
    }).run("continue", { continuation: true });
    expect(result.status).toBe("incomplete");
    expect(await readFile(path.join(cwd, "source.js"), "utf8")).toBe("export const = BROKEN");
    expect(result.session.events.filter((event) => event.type === "tool_start")).toHaveLength(3);
  } finally {
    if (deadline) clearTimeout(deadline);
    child.kill("SIGKILL");
    if (priorHome === undefined) delete process.env.NANOCODIN_HOME; else process.env.NANOCODIN_HOME = priorHome;
    await rm(cwd, { recursive: true, force: true });
  }
}, 10_000);
