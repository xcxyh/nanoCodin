import { describe, expect, it } from "vitest";
import { RecoveryEngine } from "../../src/services/recoveryEngine.js";

describe("RecoveryEngine", () => {
  const engine = new RecoveryEngine({
    enabled: true,
    maxRetryPerStep: 1,
    dedupeWindowSteps: 2
  });

  it("normalizes todo payload on input schema errors", () => {
    const attempt = engine.suggest(
      {
        name: "todo",
        input: { operation: "create", content: "write tests" }
      },
      "Invalid input for tool todo: schema mismatch"
    );

    expect(attempt.type).toBe("input_schema");
    expect(attempt.action).toEqual({
      name: "todo",
      input: {
        operation: "create_todo_list",
        content: "write tests",
        items: ["write tests"]
      }
    });
  });

  it("falls back rg command when command not found", () => {
    const attempt = engine.suggest(
      {
        name: "bash",
        input: { command: "rg TODO src" }
      },
      "bash: rg: command not found"
    );

    expect(attempt.type).toBe("command_not_found");
    expect(attempt.action).toEqual({
      name: "bash",
      input: { command: "grep -R TODO src", timeoutMs: undefined }
    });
  });

  it("deduplicates recovery attempts by signature and max retry", () => {
    const sig = engine.createSignature({ name: "bash", input: { command: "npm test" } }, "ERROR: test failed");

    expect(engine.shouldAttempt(0, [], sig)).toBe(true);
    expect(engine.shouldAttempt(1, [], sig)).toBe(false);
    expect(engine.shouldAttempt(0, [sig], sig)).toBe(false);
  });

  it("returns no-op recovery for unknown errors", () => {
    const attempt = engine.suggest(
      {
        name: "view",
        input: { path: "README.md" }
      },
      "unexpected runtime failure"
    );

    expect(attempt.type).toBe("unknown");
    expect(attempt.action).toBeNull();
  });

  it("normalizes numeric fields and path in generic input schema recovery", () => {
    const attempt = engine.suggest(
      {
        name: "insert",
        input: { path: "src/../src/index.ts", line: "42", timeoutMs: "1000" }
      },
      "Invalid input for tool insert: expected numbers"
    );

    expect(attempt.action).toEqual({
      name: "insert",
      input: { path: "src/index.ts", line: 42, timeoutMs: 1000 }
    });
  });

  it("falls back npm test to npm run typecheck when script is missing", () => {
    const attempt = engine.suggest(
      {
        name: "bash",
        input: { command: "npm test" }
      },
      "npm ERR! missing script: test\nbash: command not found"
    );

    expect(attempt.action).toEqual({
      name: "bash",
      input: { command: "npm run typecheck", timeoutMs: undefined }
    });
  });

  it("returns fallback commands for fd and bat", () => {
    const fdAttempt = engine.suggest(
      {
        name: "bash",
        input: { command: "fd package.json" }
      },
      "bash: fd: command not found"
    );
    const batAttempt = engine.suggest(
      {
        name: "bash",
        input: { command: "bat README.md" }
      },
      "bash: bat: command not found"
    );

    expect(fdAttempt.action).toEqual({
      name: "bash",
      input: { command: "find . -name package.json", timeoutMs: undefined }
    });
    expect(batAttempt.action).toEqual({
      name: "bash",
      input: { command: "cat README.md", timeoutMs: undefined }
    });
  });

  it("does not attempt recovery when disabled", () => {
    const disabled = new RecoveryEngine({
      enabled: false,
      maxRetryPerStep: 2,
      dedupeWindowSteps: 2
    });
    const sig = disabled.createSignature({ name: "ls", input: { path: "." } }, "ERROR");

    expect(disabled.shouldAttempt(0, [], sig)).toBe(false);
  });

  it("does not retry when sanitizeInput cannot fix the input", () => {
    // When view tool receives empty object {}, sanitizeInput cannot add missing required fields
    const attempt = engine.suggest(
      {
        name: "view",
        input: {}
      },
      "Invalid input for tool view: Required at \"path\""
    );

    expect(attempt.type).toBe("input_schema");
    expect(attempt.action).toBeNull();
    expect(attempt.note).toContain("Cannot auto-recover");
  });
});
