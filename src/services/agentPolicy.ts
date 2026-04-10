import type { AgentPhase } from "../agent/reactLoop.js";
import type { ToolCall } from "../core/messageTypes.js";
import type { TodoState, Tool, ToolCapability } from "../core/toolTypes.js";
import {
  MAX_TODO_ITEMS,
  formatPlanPhaseTodoGuidance,
  formatTodoPlanGateReason
} from "../tools/planning/todoLimits.js";

function hasCapability(tool: Tool<any> | undefined, capability: ToolCapability): boolean {
  return tool?.capabilities?.includes(capability) ?? false;
}

export function isReadOnlyTool(tool: Tool<any> | undefined): boolean {
  return hasCapability(tool, "read_only");
}

export function isVerificationTool(tool: Tool<any> | undefined): boolean {
  return hasCapability(tool, "verification");
}

export function isSummaryTool(tool: Tool<any> | undefined): boolean {
  return hasCapability(tool, "summary");
}

export function isDelegationTool(tool: Tool<any> | undefined): boolean {
  return hasCapability(tool, "delegation");
}

export function isMutatingTool(tool: Tool<any> | undefined): boolean {
  return hasCapability(tool, "mutating");
}

export function inferPhaseForAction(
  currentPhaseVisits: Record<string, number>,
  action: ToolCall,
  tool: Tool<any> | undefined
): AgentPhase {
  if (hasCapability(tool, "planning")) {
    return "plan";
  }
  if (isVerificationTool(tool)) {
    return "verify";
  }
  if (isReadOnlyTool(tool) || isDelegationTool(tool)) {
    return (currentPhaseVisits.discover ?? 0) === 0 ? "discover" : "execute";
  }
  return "execute";
}

export function canExecuteAction(
  phase: AgentPhase,
  action: ToolCall,
  tool: Tool<any> | undefined,
  todos: TodoState
): { ok: boolean; reason?: string } {
  if (!tool) {
    return { ok: true };
  }
  if (phase === "discover" && !isReadOnlyTool(tool) && !hasCapability(tool, "planning")) {
    return { ok: false, reason: "Discover phase allows only read-only exploration and planning tools." };
  }
  if (!isMutatingTool(tool)) {
    return { ok: true };
  }
  const count = todos.items.length;
  if (count === 0 || count > MAX_TODO_ITEMS) {
    return { ok: false, reason: formatTodoPlanGateReason() };
  }
  return { ok: true };
}

export function buildToolHelp(tools: Tool<any>[], phase: AgentPhase): string {
  const readOnly = tools.filter((tool) => isReadOnlyTool(tool)).map((tool) => tool.name);
  const planning = tools.filter((tool) => hasCapability(tool, "planning")).map((tool) => tool.name);
  const verification = tools.filter((tool) => isVerificationTool(tool)).map((tool) => tool.name);
  const summary = tools.filter((tool) => isSummaryTool(tool)).map((tool) => tool.name);
  const delegation = tools.filter((tool) => isDelegationTool(tool)).map((tool) => tool.name);

  const lines = [
    `Read-only tools: ${readOnly.join(", ") || "(none)"}`,
    `Planning tools: ${planning.join(", ") || "(none)"}`,
    `Verification tools: ${verification.join(", ") || "(none)"}`,
    `Summary tools: ${summary.join(", ") || "(none)"}`,
    `Delegation tools: ${delegation.join(", ") || "(none)"}`
  ];

  if (phase === "plan") {
    lines.unshift(formatPlanPhaseTodoGuidance());
  }
  if (phase === "verify") {
    lines.unshift("In verify, run or inspect validation and capture the latest result before final.");
  }
  return lines.map((line) => `- ${line}`).join("\n");
}
