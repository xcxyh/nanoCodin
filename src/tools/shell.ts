import { outputTail, runShell } from "./process.js";
import { isSingleCommand, splitCommandList, splitSingleCommand } from "./shellCommand.js";
import { z } from "zod";
import type { SandboxConfig } from "../core/runtimeConfig.js";
import type { Tool } from "../core/toolTypes.js";
import { defineTool } from "./define.js";
import { isVerificationCommand } from "../workflows/verification.js";

type ShellEffect = "read" | "write" | "unknown";
function commandEffect(command: string): ShellEffect {
  const parts = splitCommandList(command);
  if (!parts) return "unknown";
  let unknown = false;
  for (const part of parts) {
    const simple = part.replace(/(?:^|\s)\d*>{1,2}\s*\/dev\/null(?=\s|$)/g, " ");
    const words = splitSingleCommand(simple);
    if (!words?.length) { unknown = true; continue; }
    const [name, sub] = words;
    if (["tee", "mv", "cp", "touch", "mkdir", "rmdir", "rm"].includes(name)) return "write";
    if (name === "git") {
      if (["add", "commit", "apply", "reset", "checkout", "clean", "restore"].includes(sub) || words.some((word) => /^--output(?:=|$)/.test(word))) return "write";
      if (!["status", "diff", "log", "show", "rev-parse", "ls-files"].includes(sub) || words.some((word) => /^--(?:ext-diff|textconv)(?:=|$)/.test(word))) unknown = true;
    } else if (["npm", "pnpm", "yarn"].includes(name)) {
      if (["install", "add", "remove", "uninstall", "publish"].includes(sub)) return "write";
      unknown = true;
    } else if (name === "find") {
      if (words.some((word) => /^-(?:delete|exec|execdir|ok|okdir)$/.test(word))) return "write";
    } else if (name === "sed") {
      if (words.some((word) => /^-i|^--in-place|(?:^|[;\s\d])[we](?:\s|$)/.test(word))) return "write";
      if (!words.includes("-n") || !words.some((word) => /^[\d$]+(?:,[\d$]+)?p$/.test(word))) unknown = true;
    } else if (name === "rg") {
      if (words.some((word) => /^--(?:pre|hostname-bin)(?:=|$)/.test(word))) return "write";
    } else if (name === "tree") { if (words.includes("-o")) return "write";
    } else if (!["ls", "pwd", "cat", "grep", "head", "tail", "wc", "echo", "printf", "cd", "true", "false"].includes(name)) unknown = true;
  }
  return unknown ? "unknown" : "read";
}
/** Conservative authorization hint, never proof that a file was modified. */
export function isWriteCommand(command: string): boolean { return commandEffect(command) !== "read"; }
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
  if (!isSingleCommand(normalized) || requiresUtilityApproval(normalized) || commandEffect(normalized) === "write") return config.defaultPolicy === "deny" ? "deny" : "ask";
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
      const effect = commandEffect(input.command);
      const verification = input.purpose !== "edit" && effect !== "write" && isSingleCommand(input.command) && (input.purpose === "verify" || isVerificationCommand(input.command));
      const uncertainChanges = input.purpose === "edit" || effect === "write" || (effect === "unknown" && !verification);
      const evidence = (exitCode: number | null, stdout = "", stderr = "") => ({ command: input.command, exitCode, stdout, stderr, durationMs: Date.now() - started, verification });
      if (policy === "deny") return { ok: false, reason: "denied", output: "Command denied by policy.", effects: { command: evidence(null) } };
      if (policy === "ask" && approvedSession !== context.sessionId) {
        if (!context.ask) return { ok: false, reason: "denied", output: "Command requires approval; interactive approval is unavailable. Use an explicit shell policy or run interactively.", effects: { command: evidence(null) } };
        let choice: string;
        try {
          choice = await context.ask({
            title: "允许执行命令？", details: [{ label: "command", value: input.command }],
            options: [{ value: "once", label: "仅本次", shortcutKey: "y" }, { value: "session", label: "本次会话", shortcutKey: "a" }, { value: "deny", label: "拒绝", shortcutKey: "n" }]
          }, context.signal);
        } catch (error) {
          if (!context.signal?.aborted) throw error;
          return { ok: false, reason: "cancelled", output: "Command cancelled.", effects: { command: evidence(null) } };
        }
        if (choice !== "once" && choice !== "session") return { ok: false, reason: "denied", output: "Permission denied by user.", effects: { command: evidence(null) } };
        if (choice === "session" && context.sessionId) approvedSession = context.sessionId;
      }
      const tail = (text: string) => outputTail(text, config.maxOutputBytes);
      try {
        const { result, stopped, stdout, stderr } = await runShell(input.command, context.cwd, input.timeoutMs ?? config.timeoutMs, context.signal, context.onOutput, config.maxOutputBytes);
        const diagnostic = stopped === "cancelled" ? "Command cancelled." : stopped === "timed out" ? `Command timed out after ${input.timeoutMs ?? config.timeoutMs}ms.` : result.signal ? `Command stopped by ${result.signal}.` : "";
        const error = result.failed && result.exitCode === undefined && !stopped ? result.shortMessage : "";
        const log = evidence(stopped ? null : result.exitCode ?? null, tail(stdout), tail([stderr, diagnostic, error].filter(Boolean).join("\n")));
        const output = `exit=${log.exitCode}\n${log.stdout}${log.stderr ? `\nstderr:\n${log.stderr}` : ""}`;
        return { ok: !stopped && !result.failed && result.exitCode === 0, reason: stopped === "cancelled" ? "cancelled" : stopped === "timed out" ? "timeout" : undefined,
          output: stopped === "cancelled" ? `Command cancelled.${stdout || stderr ? `\n${output}` : ""}` : output,
          effects: { uncertainChanges, command: log } };
      } catch (error) {
        if (context.signal?.aborted) return { ok: false, reason: "cancelled", output: "Command cancelled.", effects: { uncertainChanges, command: evidence(null) } };
        const message = error instanceof Error ? error.message : String(error);
        const log = evidence(null, "", tail(message));
        return { ok: false, output: `Command interrupted or timed out: ${log.stderr}`, effects: { uncertainChanges, command: log } };
      }
    }
  });
}
