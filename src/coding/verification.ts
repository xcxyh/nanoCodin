import { accumulateTokenUsage, type TokenUsage } from "../agent/messages.js";
import type { PlanItem } from "../agent/tools.js";
import type { Session } from "../agent/session.js";
import { isSingleCommand } from "../tools/shellCommand.js";

import { deliveryFacts, deliveryIssue, invalidateHeads, newDelivery, prCreationCommand, recordDelivery, repositoryCommand } from "./pullRequest.js";
import { checkFeedback } from "./checkFeedback.js";

function projectCoding(session: Session) {
  const edits = new Map<string, number>();
  const passingChecks = new Map<string, number>();
  let plan: PlanItem[] = [];
  let delivery = newDelivery();
  let completedTools = 0;
  let checkIssue: string | undefined;
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
        completedTools = 0;
        delivery = newDelivery(task);
        checkIssue = undefined;
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
        invalidateHeads(delivery);
        checks = Object.create(null);
        passingChecks.clear();
      }
    } else if (event.type === "tool_end") {
      const effect = event.result.effects;
      const command = effect?.command;
      const shell = event.call.name === "bash" ? command : undefined;
      const repository = shell ? repositoryCommand(shell.command, session.cwd) : undefined;
      const possibleEdit = effect?.uncertainChanges && !repository;
      if (event.result.ok) completedTools++;
      if (possibleEdit || effect?.changed || effect?.changedFiles?.length) invalidateHeads(delivery);
      if (shell) {
        const createAttempt = repository?.action === "create" || (!repository && prCreationCommand(shell.command, session.cwd));
        recordDelivery(delivery, repository, createAttempt, shell, event.result.ok && shell.exitCode === 0);
      }
      if (effect?.changed || effect?.changedFiles?.length) {
        changed = true;
        checkIssue = undefined;
        checks = Object.create(null);
        passingChecks.clear();
        for (const file of effect.changedFiles ?? []) edits.set(file, index);
      }
      if (possibleEdit) { uncertainChanges = true; checks = Object.create(null); passingChecks.clear(); }
      if (effect?.plan) plan = effect.plan;
      if (effect?.verificationCommands) requiredChecks = effect.verificationCommands;
      const purpose = (event.call.input as { purpose?: string } | null)?.purpose;
      if (command && (purpose === "verify" || command.verification)) {
        checkIssue = repository ? "Git/PR 状态查询仅用于交付核对；请单独运行与源码改动相关的检查。" : checkFeedback(command, event.result.reason);
      }
      if (!repository && command?.verification && !effect?.changed && !effect?.changedFiles?.length && !effect?.uncertainChanges && isSingleCommand(command.command)) {
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
  return { state, pins, checkIssue, delivery, completedTools };
}

/** Public projection shared by the UI, review, and the completion hook. */
export function projectSession(session: Session) {
  return projectCoding(session).state;
}

export function codingHistoryHints(session: Session) {
  const projection = projectCoding(session);
  const { state, pins, delivery } = projection;
  const facts = [
    state.files.length ? `Changed files: ${state.files.slice(-20).join(", ")}` : "",
    state.uncertainChanges ? "Possible side effects are uncertain; inspect actual state and verify before finishing." : "",
    state.plan.length ? `Current plan: ${state.plan.map(item => `${item.status}: ${item.text}`).join("; ")}` : "",
    state.changed || state.uncertainChanges ? `Current changes verified: ${state.verified}` : "",
    ...deliveryFacts(delivery),
    deliveryIssue(delivery),
    (state.changed || state.uncertainChanges || state.missingChecks.length) && !state.verified ? projection.checkIssue : undefined,
    state.missingChecks.length ? `Pending checks: ${state.missingChecks.join(", ")}` : ""
  ].filter((fact): fact is string => Boolean(fact));
  return { facts, pins };
}

export function isVerificationCommand(command: string): boolean {
  return isSingleCommand(command) && /^(?:(?:npm|pnpm|yarn)\s+(?:run\s+)?(?:test(?::[\w-]+)?|lint|typecheck|build)\b|(?:npx\s+)?(?:vitest|jest|mocha|tsc|eslint|pytest|mypy|pyright|phpunit)\b|python(?:3)?\s+-m\s+(?:pytest|unittest)\b|ruff\s+check\b|(?:go|cargo|deno)\s+test\b)/i.test(command.trim());
}

export function isVerificationCandidate(command: string, purpose: "inspect" | "edit" | "verify" | undefined, writes: boolean) {
  if (writes || purpose === "edit") return false;
  return purpose === "verify" ? isSingleCommand(command) : isVerificationCommand(command);
}

function codeIssue({ state, checkIssue }: ReturnType<typeof projectCoding>) {
  const failed = Object.keys(state.checks).filter(name => !state.checks[name]);
  if (!(state.changed || state.uncertainChanges || state.missingChecks.length || failed.length) || state.verified) return;
  const pending = [...new Set([...failed, ...state.missingChecks])];
  return [checkIssue,
    pending.length ? `仍需单独运行并通过：${pending.join("、")}。` : undefined,
    !checkIssue && !pending.length
      ? `${state.files.length ? "最新修改涉及 " + state.files.slice(-3).join("、") : "工具执行可能改变了工作区"}，之后尚无成功的独立检查。请单独运行与此改动相关的检查。`
      : undefined
  ].filter(Boolean).join(" ");
}

export function requireVerification(session: Session): string | undefined {
  const projection = projectCoding(session);
  const code = codeIssue(projection);
  return [code && `Verification required. ${code}`, deliveryIssue(projection.delivery)].filter(Boolean).join("\n") || undefined;
}

export function budgetSummary(session: Session): string {
  const projection = projectCoding(session);
  const { state, delivery, completedTools } = projection;
  const facts = deliveryFacts(delivery);
  if (state.files.length) facts.push(`已修改：${state.files.slice(-10).join("、")}。`);
  const passed = Object.keys(state.checks).filter(name => state.checks[name]);
  if (passed.length) facts.push(`已通过检查：${passed.slice(-5).map(name => name.slice(0, 120)).join("、")}。`);
  if (!facts.length && completedTools) facts.push(`已成功执行 ${completedTools} 次工具调用。`);
  const pending = [codeIssue(projection), deliveryIssue(delivery)].filter(Boolean);
  return [...facts, pending.length ? `待完成：${pending.join("\n")}` : "尚未取得模型的最终答复。"].join("\n");
}
