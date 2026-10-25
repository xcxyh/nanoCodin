import { accumulateTokenUsage, type TokenUsage } from "../core/messageTypes.js";
import type { PlanItem } from "../core/toolTypes.js";
import type { Session } from "./types.js";
import { isSingleCommand } from "../tools/shellCommand.js";

export function projectSession(session: Session) {
  let plan: PlanItem[] = [];
  const files = new Set<string>();
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
  for (const event of session.events) {
    if (event.type === "user") {
      if (!event.continuation) {
        task = event.text;
        plan = [];
        files.clear();
        changed = false;
        uncertainChanges = false;
        checks = Object.create(null);
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
      }
    } else if (event.type === "tool_end") {
      const effect = event.result.effects;
      if (effect?.changed || effect?.changedFiles?.length) {
        changed = true;
        checks = Object.create(null);
        for (const file of effect.changedFiles ?? []) files.add(file);
      }
      if (effect?.uncertainChanges) { uncertainChanges = true; checks = Object.create(null); }
      if (effect?.plan) plan = effect.plan;
      if (effect?.verificationCommands) requiredChecks = effect.verificationCommands;
      if (effect?.command?.verification && !effect.changed && !effect.changedFiles?.length && !effect.uncertainChanges && isSingleCommand(effect.command.command)) checks[effect.command.command.trim()] = event.result.ok && effect.command.exitCode === 0;
    } else if (event.type === "finish") {
      finish = event;
    }
  }
  const missingChecks = requiredChecks.filter((command) => checks[command.trim()] !== true);
  const results = Object.values(checks);
  const verified = missingChecks.length === 0 && results.length > 0 && results.every(Boolean);
  const pending = [...pendingCalls.values()].at(-1) ?? null;
  return { task, plan, files: [...files], changed, uncertainChanges, checks, missingChecks, verified, usage, pending, finish };
}
