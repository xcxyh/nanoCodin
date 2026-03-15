import { describe, expect, it } from "vitest";
import { applyInputKey, isCtrlC, type InputKey } from "../../src/ui/useConsoleInput.js";

function key(overrides: Partial<InputKey> = {}): InputKey {
  return {
    leftArrow: false,
    rightArrow: false,
    return: false,
    ctrl: false,
    delete: false,
    backspace: false,
    meta: false,
    ...overrides
  };
}

describe("applyInputKey", () => {
  it("inserts text at cursor", () => {
    const next = applyInputKey({ input: "helo", cursor: 2 }, "l", key());
    expect(next).toEqual({ input: "hello", cursor: 3 });
  });

  it("moves cursor with arrows and clamps boundaries", () => {
    const atStart = applyInputKey({ input: "abc", cursor: 0 }, "", key({ leftArrow: true }));
    const atEnd = applyInputKey({ input: "abc", cursor: 3 }, "", key({ rightArrow: true }));

    expect(atStart.cursor).toBe(0);
    expect(atEnd.cursor).toBe(3);
  });

  it("supports backspace and delete with normalized semantics", () => {
    // backspace key: key.backspace=true
    const backspaced = applyInputKey({ input: "ab|cd".replace("|", ""), cursor: 2 }, "", key({ backspace: true }));
    expect(backspaced).toEqual({ input: "acd", cursor: 1 });

    // delete key sends escape sequence \u001b[3~
    const deleted = applyInputKey({ input: "ab|cd".replace("|", ""), cursor: 2 }, "\u001b[3~", key());
    expect(deleted).toEqual({ input: "abd", cursor: 2 });
  });

  it("treats Mac backspace (key.delete=true with empty char) as backspace", () => {
    // On Mac, Backspace key sends \x7f which Ink parses as 'delete' with char=''
    // This should delete character before cursor (backspace behavior)
    const macBackspace = applyInputKey({ input: "abcd", cursor: 4 }, "", key({ delete: true }));
    expect(macBackspace).toEqual({ input: "abc", cursor: 3 });
  });

  it("treats delete+DEL char as backspace for terminal compatibility", () => {
    const next = applyInputKey({ input: "abcd", cursor: 4 }, "\u007f", key({ delete: true }));
    expect(next).toEqual({ input: "abc", cursor: 3 });
  });

  it("moves to start/end with Ctrl+A and Ctrl+E", () => {
    const toStart = applyInputKey({ input: "abcdef", cursor: 4 }, "a", key({ ctrl: true }));
    const toEnd = applyInputKey({ input: "abcdef", cursor: 1 }, "e", key({ ctrl: true }));

    expect(toStart.cursor).toBe(0);
    expect(toEnd.cursor).toBe(6);
  });

  it("moves to start/end with Home/End escape sequences", () => {
    const toStart = applyInputKey({ input: "abcdef", cursor: 4 }, "\u001b[H", key());
    const toEnd = applyInputKey({ input: "abcdef", cursor: 1 }, "\u001b[F", key());

    expect(toStart.cursor).toBe(0);
    expect(toEnd.cursor).toBe(6);
  });

  it("ignores escaped input that is not a recognized edit key", () => {
    const next = applyInputKey({ input: "hello", cursor: 5 }, "\u001b[999~", key());
    expect(next).toEqual({ input: "hello", cursor: 5 });
  });
});

describe("isCtrlC", () => {
  it("recognizes control-c character", () => {
    expect(isCtrlC("\u0003", key({ ctrl: true }))).toBe(true);
  });
});
