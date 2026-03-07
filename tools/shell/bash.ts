import { execa } from "execa";
import { z } from "zod";
import type { Tool } from "../../core/toolTypes.js";

const schema = z.object({
  command: z.string().min(1),
  timeoutMs: z.number().int().min(1000).max(120000).optional()
});

type Input = z.infer<typeof schema>;

const BLOCKLIST = [
  /rm\s+-rf\s+\//,
  /:\(\)\s*\{\s*:\|:&\s*\};:/,
  /shutdown/i,
  /reboot/i,
  /mkfs/i,
  /dd\s+if=.*of=\/dev\//i
];

function isBlocked(command: string): string | null {
  for (const rule of BLOCKLIST) {
    if (rule.test(command)) {
      return `Command blocked by safety policy (${rule.toString()}).`;
    }
  }
  return null;
}

export const bashTool: Tool<Input> = {
  name: "bash",
  description: "Execute a shell command with safety checks and timeout",
  schema,
  execute: async (input, context) => {
    const blocked = isBlocked(input.command);
    if (blocked) {
      return { ok: false, output: blocked };
    }

    try {
      const result = await execa("bash", ["-lc", input.command], {
        cwd: context.cwd,
        timeout: input.timeoutMs ?? 15000,
        reject: false
      });

      const output = [
        `exitCode: ${result.exitCode}`,
        result.stdout ? `stdout:\n${result.stdout}` : "stdout: (empty)",
        result.stderr ? `stderr:\n${result.stderr}` : "stderr: (empty)"
      ].join("\n\n");

      return { ok: result.exitCode === 0, output };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, output: `bash execution failed: ${message}` };
    }
  }
};
