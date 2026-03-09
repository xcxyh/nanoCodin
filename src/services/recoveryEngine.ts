import path from "node:path";
import type { ToolCall } from "../core/messageTypes.js";
import type { RecoveryConfig } from "../core/runtimeConfig.js";

export type RecoveryErrorType =
  | "input_schema"
  | "missing_file/path"
  | "command_not_found"
  | "test_failure"
  | "permission_policy"
  | "unknown";

export interface RecoveryAttempt {
  type: RecoveryErrorType;
  signature: string;
  action: ToolCall | null;
  note: string;
}

function classifyError(message: string): RecoveryErrorType {
  const lower = message.toLowerCase();
  if (lower.includes("invalid input for tool")) return "input_schema";
  if (lower.includes("no such file") || lower.includes("enoent") || lower.includes("not found:")) return "missing_file/path";
  if (lower.includes("command not found")) return "command_not_found";
  if (lower.includes("test") && lower.includes("failed")) return "test_failure";
  if (lower.includes("policy_decision") || lower.includes("blocked by safety policy")) return "permission_policy";
  return "unknown";
}

function sanitizeInput(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") {
    return raw;
  }
  const source = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string" && ["line", "startLine", "endLine", "timeoutMs", "maxDepth", "maxResults"].includes(key)) {
      const num = Number.parseInt(value, 10);
      out[key] = Number.isFinite(num) ? num : value;
      continue;
    }
    if (key === "path" && typeof value === "string") {
      out[key] = path.normalize(value);
      continue;
    }
    out[key] = value;
  }
  return out;
}

function recoverCommandNotFound(original: string, message: string): string | null {
  if (!message.toLowerCase().includes("command not found")) {
    return null;
  }
  const cmd = original.trim().split(/\s+/)[0];
  if (cmd === "rg") {
    return original.replace(/^rg\b/, "grep -R");
  }
  if (cmd === "fd") {
    return original.replace(/^fd\b/, "find . -name");
  }
  if (cmd === "bat") {
    return original.replace(/^bat\b/, "cat");
  }
  if (/npm\s+test/.test(original) && /missing script: test/i.test(message)) {
    return "npm run typecheck";
  }
  return null;
}

export class RecoveryEngine {
  constructor(private readonly config: RecoveryConfig) {}

  createSignature(action: ToolCall, errorText: string): string {
    return `${action.name}:${errorText.slice(0, 160)}`;
  }

  shouldAttempt(stepRecoveryCount: number, recentSignatures: string[], signature: string): boolean {
    if (!this.config.enabled) {
      return false;
    }
    if (stepRecoveryCount >= this.config.maxRetryPerStep) {
      return false;
    }
    return !recentSignatures.includes(signature);
  }

  suggest(action: ToolCall, errorText: string): RecoveryAttempt {
    const type = classifyError(errorText);
    if (type === "input_schema") {
      return {
        type,
        signature: this.createSignature(action, errorText),
        action: { name: action.name, input: sanitizeInput(action.input) },
        note: "Retrying with sanitized schema-compatible fields."
      };
    }

    if (type === "command_not_found" && action.name === "bash") {
      const input = action.input as { command?: unknown; timeoutMs?: unknown };
      if (typeof input.command === "string") {
        const recovered = recoverCommandNotFound(input.command, errorText);
        if (recovered) {
          return {
            type,
            signature: this.createSignature(action, errorText),
            action: { name: "bash", input: { command: recovered, timeoutMs: input.timeoutMs } },
            note: `Retrying with fallback command: ${recovered}`
          };
        }
      }
    }

    return {
      type,
      signature: this.createSignature(action, errorText),
      action: null,
      note: "No safe single-step recovery action available."
    };
  }
}

