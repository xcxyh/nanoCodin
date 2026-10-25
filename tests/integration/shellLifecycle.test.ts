import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import { describe, expect, it } from "vitest";
import { runShell } from "../../src/tools/process.js";

// POSIX process groups; Windows keeps execa's existing non-detached lifecycle.
describe.skipIf(process.platform === "win32")("shell host lifecycle", () => {
  it.each([["exit", 1], ["SIGINT", 1], ["SIGTERM", 1], ["SIGHUP", 1], ["handled", 1], ["cancel", 1], ["SIGTERM", 2]] as const)(
    "cleans %s with %s process group(s), preserving host signal handling", async (mode, count) => {
      const cwd = await mkdtemp(path.join(os.tmpdir(), "nanocodin-shell-exit-"));
      try {
        const fixture = fileURLToPath(new URL("../fixtures/shellLifecycle.ts", import.meta.url));
        const result = await execa(process.execPath, ["--import", "tsx", fixture, cwd, mode, String(count)], { reject: false, timeout: 5000 });
        if (mode === "exit") expect(result.exitCode).toBe(0);
        else if (mode === "handled") {
          expect(result.exitCode).toBe(7);
          expect(await readFile(path.join(cwd, "handled"), "utf8")).toBe("yes");
        } else if (mode === "cancel") {
          expect(result.exitCode).toBe(0);
          expect(await readFile(path.join(cwd, "handled"), "utf8")).toBe("cancelled");
        } else expect(result.signal).toBe(mode);
        await new Promise((resolve) => setTimeout(resolve, 800));
        for (let index = 0; index < count; index++) await expect(readFile(path.join(cwd, `late-${index}`), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
      } finally { await rm(cwd, { recursive: true, force: true }); }
    }, 7000
  );
  it("removes temporary signal and exit hooks after an ordinary command", async () => {
    const signals = ["exit", "SIGINT", "SIGTERM", "SIGHUP"] as const;
    const counts = signals.map((signal) => process.listenerCount(signal));
    await runShell("true", process.cwd(), 1000);
    expect(signals.map((signal) => process.listenerCount(signal))).toEqual(counts);
  });
});
