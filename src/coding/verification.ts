import { accumulateTokenUsage, type TokenUsage } from "../agent/messages.js";
import type { PlanItem } from "../agent/tools.js";
import type { Session } from "../agent/session.js";
import { isSingleCommand } from "../tools/shellCommand.js";

function projectCoding(session: Session) {
  const edits = new Map<string, number>();
  const passingChecks = new Map<string, number>();
  let plan: PlanItem[] = [];
  let changed = false;
  let uncertainChanges = false;
  let checks: Record<string, boolean> = Object.create(null);
  let requiredChecks: string[] = [];
  let usage: TokenUsage | null = null;
  let task = "";
  const pendingCalls = new Map<string, Extract<Session["events"][number], { type: "tool_start" }>>();
  for (const event of session.events) {
    if (event.type === "tool_start") pendingCalls.set(event.callId, event);
    else if (event.type === "tool_end") pendingCalls.delete(event.callId);
  }
  let finish: Extract<Session["events"][number], { type: "finish" }> | null = null;
  for (const [index, event] of session.events.entries()) {
    if (event.type === "user") {
      if (!event.continuation) {
        task = event.text;
        plan = [];
        edits.clear();
        changed = false;
        uncertainChanges = false;
        checks = Object.create(null);
        passingChecks.clear();
        requiredChecks = [];
      }
      finish = null;
    } else if (event.type === "usage") {
      usage = accumulateTokenUsage(usage, event.usage);
    } else if (event.type === "tool_start") {
      // A crash may occur after effects, before tool_end. Legacy starts lack intent,
      // so unresolved legacy calls are conservatively treated as possible writes.
      if (pendingCalls.has(event.callId) && event.mutates !== false) {
        uncertainChanges = true;
        checks = Object.create(null);
        passingChecks.clear();
      }
    } else if (event.type === "tool_end") {
      const effect = event.result.effects;
      if (effect?.changed || effect?.changedFiles?.length) {
        changed = true;
        checks = Object.create(null);
        passingChecks.clear();
        for (const file of effect.changedFiles ?? []) edits.set(file, index);
      }
      if (effect?.uncertainChanges) { uncertainChanges = true; checks = Object.create(null); passingChecks.clear(); }
      if (effect?.plan) plan = effect.plan;
      if (effect?.verificationCommands) requiredChecks = effect.verificationCommands;
      const command = effect?.command;
      if (command?.verification && !effect?.changed && !effect?.changedFiles?.length && !effect?.uncertainChanges && isSingleCommand(command.command)) {
        const name = command.command.trim();
        checks[name] = event.result.ok && command.exitCode === 0;
        if (checks[name]) passingChecks.set(name, index);
        else passingChecks.delete(name);
      }
    } else if (event.type === "finish") {
      finish = event;
    }
  }
  const missingChecks = requiredChecks.filter((command) => checks[command.trim()] !== true);
  const results = Object.values(checks);
  const verified = missingChecks.length === 0 && results.length > 0 && results.every(Boolean);
  const pending = [...pendingCalls.values()].at(-1) ?? null;
  const state = { task, plan, files: [...edits.keys()], changed, uncertainChanges, checks, missingChecks, verified, usage, pending, finish };
  const pins = [...new Set(edits.values())].sort((a, b) => a - b).slice(-3);
  if (verified) pins.push(...[...passingChecks.values()].sort((a, b) => a - b).slice(-2));
  return { state, pins };
}

/** Public projection shared by the UI, review, and the completion hook. */
export function projectSession(session: Session) {
  return projectCoding(session).state;
}

export function codingHistoryHints(session: Session) {
  const { state, pins } = projectCoding(session);
  const facts = [
    state.files.length ? `Changed files: ${state.files.slice(-20).join(", ")}` : "",
    state.uncertainChanges ? "Possible side effects are uncertain; inspect actual state and verify before finishing." : "",
    state.plan.length ? `Current plan: ${state.plan.map(item => `${item.status}: ${item.text}`).join("; ")}` : "",
    state.changed || state.uncertainChanges ? `Current changes verified: ${state.verified}` : "",
    state.missingChecks.length ? `Pending checks: ${state.missingChecks.join(", ")}` : ""
  ].filter(Boolean);
  return { facts, pins };
}

export function isVerificationCommand(command: string): boolean {
  return isSingleCommand(command) && /^(?:(?:npm|pnpm|yarn)\s+(?:run\s+)?(?:test(?::[\w-]+)?|lint|typecheck|build)\b|(?:npx\s+)?(?:vitest|jest|mocha|tsc|eslint|pytest|mypy|pyright|phpunit)\b|python(?:3)?\s+-m\s+(?:pytest|unittest)\b|ruff\s+check\b|(?:go|cargo|deno)\s+test\b)/i.test(command.trim());
}

export function isVerificationCandidate(command: string, purpose: "inspect" | "edit" | "verify" | undefined, writes: boolean) {
  if (writes || purpose === "edit") return false;
  return purpose === "verify" ? isSingleCommand(command) : isVerificationCommand(command);
}

/** Optional coding workflow. Generic Harness consumers can replace or omit this hook. */
export function requireVerification(session: Session): string | undefined {
  const state = projectSession(session);
  if ((state.changed || state.uncertainChanges) && !state.verified) return `Verification required after the latest change.${state.missingChecks.length ? ` Pending checks: ${state.missingChecks.join(", ")}.` : " Run a relevant check and inspect its exit code."}`;
}
