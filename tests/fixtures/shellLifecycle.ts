import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runShell } from "../../src/tools/process.js";

const abort = new AbortController();
const [cwd, mode, count] = process.argv.slice(2);
if (mode === "cancel") process.once("SIGINT", () => abort.abort());
if (mode === "handled") process.once("SIGTERM", () => {
  writeFileSync(path.join(cwd, "handled"), "yes");
  setTimeout(() => process.exit(7), 50);
});
const commands = Array.from({ length: Number(count) }, (_, index) => runShell(
  `node -e 'const fs=require("fs");fs.writeFileSync("ready-${index}","yes");setTimeout(()=>fs.writeFileSync("late-${index}","bad"),700)'`, cwd, 5000, abort.signal
));
const timer = setInterval(() => {
  if (commands.every((_, index) => existsSync(path.join(cwd, `ready-${index}`)))) {
    clearInterval(timer);
    if (mode === "exit") process.exit(0);
    else process.kill(process.pid, mode === "handled" ? "SIGTERM" : mode === "cancel" ? "SIGINT" : mode as NodeJS.Signals);
  }
}, 10);
const results = await Promise.all(commands);
if (mode === "cancel") writeFileSync(path.join(cwd, "handled"), results.every((result) => result.stopped === "cancelled") ? "cancelled" : "failed");
