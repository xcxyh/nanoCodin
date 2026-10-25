import { accumulateTokenUsage, type TokenUsage } from "../core/messageTypes.js";
import type { PlanItem } from "../core/toolTypes.js";
import type { Session } from "./types.js";

export function projectSession(session: Session) {
  let plan: PlanItem[] = [];
  const files = new Set<string>();
  let changed = false;
  let checks: Record<string, boolean> = {};
  let requiredChecks: string[] = [];
  let usage: TokenUsage | null = null;
  let task = "";
  let pending: Extract<Session["events"][number], { type: "tool_start" }> | null = null;
  let finish: Extract<Session["events"][number], { type: "finish" }> | null = null;
  for (const event of session.events) {
    if (event.type === "user") {
      if (!event.continuation) {
        task = event.text;
        plan = [];
        requiredChecks = [];
      }
      finish = null;
    } else if (event.type === "usage") {
      usage = accumulateTokenUsage(usage, event.usage);
    } else if (event.type === "tool_start") {
      pending = event;
    } else if (event.type === "tool_end") {
      pending = null;
      const effect = event.result.effects;
      if (effect?.changed || effect?.changedFiles?.length) {
        changed = true;
        checks = {};
        for (const file of effect.changedFiles ?? []) files.add(file);
      }
      if (effect?.plan) plan = effect.plan;
      if (effect?.verificationCommands) requiredChecks = effect.verificationCommands;
      if (effect?.command?.verification) checks[effect.command.command.trim()] = event.result.ok && effect.command.exitCode === 0;
    } else if (event.type === "finish") {
      finish = event;
    }
  }
  const missingChecks = requiredChecks.filter((command) => checks[command.trim()] !== true);
  const results = Object.values(checks);
  const verified = missingChecks.length === 0 && results.length > 0 && results.every(Boolean);
  return { task, plan, files: [...files], changed, checks, missingChecks, verified, usage, pending, finish };
}
