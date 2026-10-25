import { runShell } from "./process.js";
import { isSingleCommand, splitSingleCommand } from "./shellCommand.js";
import { z } from "zod";
import type { SandboxConfig } from "../core/runtimeConfig.js";
import type { Tool } from "../core/toolTypes.js";
import { defineTool } from "./define.js";
import { isVerificationCommand } from "../workflows/verification.js";

export function isWriteCommand(command: string): boolean {
  const normalized = splitSingleCommand(command)?.join(" ") ?? command;
  return /\b(tee|sed\s+-i|perl\s+-i|mv|cp|touch|mkdir|rmdir|rm|git\s+(?:add|commit|apply|reset|checkout)|(?:npm|pnpm|yarn)\s+(?:install|add))\b|(?:^|\s)\d*>>?/i.test(normalized)
    || /\bfind\b[\s\S]*\s-(?:delete|exec|execdir|ok|okdir)\b/i.test(normalized)
    || /\bsed\b[\s\S]*(?:[\s;'][we](?:\s|$)|--in-place\b)/i.test(normalized)
    || /\b(?:git\s+(?:diff|log)[\s\S]*--output(?:=|\s)|tree\b[\s\S]*\s-o(?:\s|$)|rg\b[\s\S]*--pre(?:=|\s))/i.test(normalized);
}
function requiresUtilityApproval(command: string): boolean {
  const words = splitSingleCommand(command, false);
  if (!words) return true;
  const [name, subcommand] = words;
  return ["find", "sed", "awk", "tree"].includes(name)
    || (name === "rg" && words.some((word) => /^--(?:pre|hostname-bin)(?:=|$)/.test(word)))
    || (name === "git" && ["diff", "log"].includes(subcommand) && words.some((word) => /^--(?:output|ext-diff|textconv)(?:=|$)/.test(word)));
}
function prefixMatches(command: string, prefix: string): boolean {
  const trimmed = prefix.trim();
  return command === trimmed || command.startsWith(`${trimmed} `);
}
export function decidePolicy(command: string, config: SandboxConfig): "allow" | "ask" | "deny" {
  const normalized = command.trim();
  for (const pattern of config.denyPatterns) {
    if (normalized.includes(pattern)) return "deny";
    try { if (new RegExp(pattern, "i").test(normalized)) return "deny"; } catch { /* Treat invalid patterns as literals. */ }
  }
  if (config.defaultPolicy === "allow") return "allow";
  if (config.askPrefixes.some((prefix) => prefixMatches(normalized, prefix))) return "ask";
  // A compound command or substitution cannot inherit the first command's allow prefix.
  if (!isSingleCommand(normalized) || requiresUtilityApproval(normalized) || isWriteCommand(normalized)) return config.defaultPolicy === "deny" ? "deny" : "ask";
  if (config.allowPrefixes.some((prefix) => prefixMatches(normalized, prefix))) return "allow";
  return config.defaultPolicy;
}

export function createShellTool(config: SandboxConfig): Tool {
  let approvedSession: string | undefined | null = null;
  return defineTool({
    name: "bash", mutates: true, description: "Execute a shell command. Mark purpose=edit for changes and purpose=verify for checks. Commands can time out, require approval, or be cancelled. Verification requires a single command without edits; run checks separately from changes.",
    schema: z.object({ command: z.string().min(1), purpose: z.enum(["inspect", "edit", "verify"]).optional(), timeoutMs: z.number().int().min(1000).max(120000).optional() }),
    async execute(input, context) {
      const started = Date.now();
      const policy = decidePolicy(input.command, config);
      const changed = input.purpose === "edit" || isWriteCommand(input.command);
      const verification = !changed && isSingleCommand(input.command) && (input.purpose === "verify" || isVerificationCommand(input.command));
      const evidence = (exitCode: number | null, stdout = "", stderr = "") => ({ command: input.command, exitCode, stdout, stderr, durationMs: Date.now() - started, verification });
      if (policy === "deny") return { ok: false, output: "Command denied by policy.", effects: { command: evidence(null) } };
      if (policy === "ask" && approvedSession !== context.sessionId) {
        if (!context.ask) return { ok: false, output: "Command requires approval; interactive approval is unavailable. Use an explicit shell policy or run interactively.", effects: { command: evidence(null) } };
        let choice: string;
        try {
          choice = await context.ask({
            title: "允许执行命令？", details: [{ label: "command", value: input.command }],
            options: [{ value: "once", label: "仅本次", shortcutKey: "y" }, { value: "session", label: "本次会话", shortcutKey: "a" }, { value: "deny", label: "拒绝", shortcutKey: "n" }]
          }, context.signal);
        } catch (error) {
          if (!context.signal?.aborted) throw error;
          return { ok: false, output: "Command cancelled.", effects: { command: evidence(null) } };
        }
        if (choice === "deny") return { ok: false, output: "Permission denied by user.", effects: { command: evidence(null) } };
        if (choice === "session") approvedSession = context.sessionId;
      }
      const tail = (text: string) => Buffer.from(text).subarray(-config.maxOutputBytes).toString("utf8");
      try {
        const { result, stopped } = await runShell(input.command, context.cwd, input.timeoutMs ?? config.timeoutMs, context.signal);
        const diagnostic = stopped === "cancelled" ? "Command cancelled." : stopped === "timed out" ? `Command timed out after ${input.timeoutMs ?? config.timeoutMs}ms.` : result.signal ? `Command stopped by ${result.signal}.` : "";
        const error = result.failed && result.exitCode === undefined && !stopped ? result.shortMessage : "";
        const log = evidence(stopped ? null : result.exitCode ?? null, tail(result.stdout), tail([result.stderr, diagnostic, error].filter(Boolean).join("\n")));
        const output = `exit=${log.exitCode}\n${log.stdout}${log.stderr ? `\nstderr:\n${log.stderr}` : ""}`;
        return { ok: !stopped && !result.failed && result.exitCode === 0,
          output: stopped === "cancelled" ? `Command cancelled.${result.stdout || result.stderr ? `\n${output}` : ""}` : output,
          effects: { changed, command: log } };
      } catch (error) {
        if (context.signal?.aborted) return { ok: false, output: "Command cancelled.", effects: { changed, command: evidence(null) } };
        const message = error instanceof Error ? error.message : String(error);
        const log = evidence(null, "", tail(message));
        return { ok: false, output: `Command interrupted or timed out: ${log.stderr}`, effects: { changed, command: log } };
      }
    }
  });
}
