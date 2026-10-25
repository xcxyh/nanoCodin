import { projectSession } from "../session/project.js";
import type { Session } from "../session/types.js";

export function isVerificationCommand(command: string): boolean {
  return command.split(/&&|\|\||[;\n|]/).some((part) => /^(?:(?:npm|pnpm|yarn)\s+(?:run\s+)?(?:test(?::[\w-]+)?|lint|typecheck|build)\b|(?:npx\s+)?(?:vitest|jest|mocha|tsc|eslint|pytest|mypy|pyright|phpunit)\b|python(?:3)?\s+-m\s+(?:pytest|unittest)\b|ruff\s+check\b|(?:go|cargo|deno)\s+test\b)/i.test(part.trim()));
}

/** Optional coding workflow. Generic Harness consumers can replace or omit this hook. */
export function requireVerification(session: Session): string | undefined {
  const state = projectSession(session);
  if (state.changed && !state.verified) return `Verification required after the latest change.${state.missingChecks.length ? ` Pending checks: ${state.missingChecks.join(", ")}.` : " Run a relevant check and inspect its exit code."}`;
}
