import { execa } from "execa";
import { z } from "zod";
import type { Tool } from "../../core/toolTypes.js";
import type { SandboxPolicyDecision } from "../../core/runtimeConfig.js";

const schema = z.object({
  command: z.string().min(1),
  timeoutMs: z.number().int().min(1000).max(120000).optional()
});

type Input = z.infer<typeof schema>;

function cutTail(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) {
    return text;
  }
  const marker = "\n...(truncated)...\n";
  const sliceBytes = Math.max(0, maxBytes - Buffer.byteLength(marker, "utf8"));
  const truncated = Buffer.from(text, "utf8").subarray(Math.max(0, Buffer.byteLength(text, "utf8") - sliceBytes)).toString("utf8");
  return `${marker}${truncated}`;
}

export function isWriteCommand(command: string): boolean {
  return /\b(echo|tee|sed\s+-i|perl\s+-i|mv|cp|touch|mkdir|rmdir|rm|git\s+add|git\s+commit)\b/i.test(command);
}

export function decidePolicy(command: string, context: Parameters<Tool<Input>["execute"]>[1]): SandboxPolicyDecision {
  const { sandbox } = context.runtimeConfig;
  const normalized = command.trim();

  for (const pattern of sandbox.denyPatterns) {
    if (normalized.includes(pattern)) {
      return "deny";
    }
    try {
      if (new RegExp(pattern, "i").test(normalized)) {
        return "deny";
      }
    } catch {
      // Ignore invalid regex pattern and keep substring check only.
    }
  }

  if (sandbox.allowPrefixes.some((prefix) => normalized.startsWith(prefix))) {
    return "allow";
  }
  if (sandbox.askPrefixes.some((prefix) => normalized.startsWith(prefix))) {
    return "ask";
  }
  if (isWriteCommand(normalized)) {
    return "ask";
  }
  return sandbox.defaultPolicy;
}

export const bashTool: Tool<Input> = {
  name: "bash",
  description: "Execute a shell command with safety checks and timeout",
  schema,
  execute: async (input, context) => {
    const startedAt = Date.now();
    const policyDecision = decidePolicy(input.command, context);

    if (policyDecision !== "allow") {
      const output = JSON.stringify({
        exit_code: null,
        stdout_tail: "",
        stderr_tail: policyDecision === "deny"
          ? "Command blocked by sandbox deny policy."
          : "Command requires explicit allow policy (ask).",
        duration_ms: Date.now() - startedAt,
        policy_decision: policyDecision
      }, null, 2);

      context.commandLogs.push({
        command: input.command,
        policyDecision,
        exitCode: null,
        durationMs: Date.now() - startedAt,
        stdoutTail: "",
        stderrTail: policyDecision === "deny" ? "blocked" : "requires confirmation",
        ok: false
      });
      return { ok: false, output };
    }

    const timeoutMs = Math.max(1000, Math.min(120000, input.timeoutMs ?? context.runtimeConfig.sandbox.timeoutMs));
    const maxOutputBytes = context.runtimeConfig.sandbox.maxOutputBytes;

    try {
      const result = await execa("bash", ["-lc", input.command], {
        cwd: context.cwd,
        timeout: timeoutMs,
        reject: false
      });

      const durationMs = Date.now() - startedAt;
      const stdoutTail = cutTail(result.stdout ?? "", maxOutputBytes);
      const stderrTail = cutTail(result.stderr ?? "", maxOutputBytes);
      const output = JSON.stringify({
        exit_code: result.exitCode,
        stdout_tail: stdoutTail,
        stderr_tail: stderrTail,
        duration_ms: durationMs,
        policy_decision: policyDecision
      }, null, 2);

      context.commandLogs.push({
        command: input.command,
        policyDecision,
        exitCode: result.exitCode ?? null,
        durationMs,
        stdoutTail,
        stderrTail,
        ok: result.exitCode === 0
      });

      return { ok: result.exitCode === 0, output };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const durationMs = Date.now() - startedAt;
      const output = JSON.stringify({
        exit_code: null,
        stdout_tail: "",
        stderr_tail: message,
        duration_ms: durationMs,
        policy_decision: policyDecision
      }, null, 2);
      context.commandLogs.push({
        command: input.command,
        policyDecision,
        exitCode: null,
        durationMs,
        stdoutTail: "",
        stderrTail: message,
        ok: false
      });
      return { ok: false, output };
    }
  }
};
