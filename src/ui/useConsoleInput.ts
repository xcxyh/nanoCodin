import { useRef, useState } from "react";

export interface InputKey {
  leftArrow: boolean;
  rightArrow: boolean;
  return: boolean;
  ctrl: boolean;
  delete: boolean;
  backspace: boolean;
  meta: boolean;
}

export interface ConsoleInputState {
  input: string;
  cursor: number;
}

const HOME_SEQUENCES = new Set(["\u001b[H", "\u001bOH", "\u001b[1~", "\u001b[7~"]);
const END_SEQUENCES = new Set(["\u001b[F", "\u001bOF", "\u001b[4~", "\u001b[8~"]);
const DELETE_SEQUENCES = new Set(["\u001b[3~", "\u001b[3$", "\u001b[3;"]);

function clampCursor(next: number, input: string): number {
  return Math.max(0, Math.min(next, input.length));
}

function isCtrlA(char: string, key: InputKey): boolean {
  return key.ctrl && !key.meta && (char === "a" || char === "A" || char === "\u0001");
}

export function isCtrlE(char: string, key: InputKey): boolean {
  return key.ctrl && !key.meta && (char === "e" || char === "E" || char === "\u0005");
}

export function isCtrlC(char: string, key: InputKey): boolean {
  return key.ctrl && (char === "c" || char === "C" || char === "\u0003");
}

function isHome(char: string, key: InputKey): boolean {
  return isCtrlA(char, key) || HOME_SEQUENCES.has(char);
}

function isEnd(char: string, key: InputKey): boolean {
  return isCtrlE(char, key) || END_SEQUENCES.has(char);
}

function isEscapedInput(char: string): boolean {
  return char.includes("\u001b");
}

function isBackspaceInput(char: string, key: InputKey): boolean {
  // key.backspace is true for Ctrl+H (\b)
  // On Mac, Backspace key sends \x7f which Ink parses as 'delete' with char=''
  // So we treat key.delete=true with char='' as Backspace for Mac compatibility
  if (key.backspace) return true;
  if (char === "\u007f" || char === "\b" || char === "\u0008") return true;
  // Mac Backspace: Ink sets key.delete=true with char=''
  // We prioritize Backspace behavior since it's the primary use case on Mac
  if (key.delete && char === "") return true;
  return false;
}

function isDeleteInput(char: string, key: InputKey): boolean {
  // Delete key sends escape sequence \u001b[3~
  // Note: Mac's Backspace is handled by isBackspaceInput
  // This handles the actual Delete key escape sequences
  if (DELETE_SEQUENCES.has(char)) return true;
  return false;
}

export function applyInputKey(state: ConsoleInputState, char: string, key: InputKey): ConsoleInputState {
  const currentInput = state.input;
  const currentCursor = clampCursor(state.cursor, currentInput);

  if (key.leftArrow) {
    return {
      input: currentInput,
      cursor: clampCursor(currentCursor - 1, currentInput)
    };
  }

  if (key.rightArrow) {
    return {
      input: currentInput,
      cursor: clampCursor(currentCursor + 1, currentInput)
    };
  }

  if (isHome(char, key)) {
    return {
      input: currentInput,
      cursor: 0
    };
  }

  if (isEnd(char, key)) {
    return {
      input: currentInput,
      cursor: currentInput.length
    };
  }

  if (isBackspaceInput(char, key)) {
    if (currentCursor === 0) {
      return state;
    }
    const nextInput = currentInput.slice(0, currentCursor - 1) + currentInput.slice(currentCursor);
    return {
      input: nextInput,
      cursor: clampCursor(currentCursor - 1, nextInput)
    };
  }

  if (isDeleteInput(char, key)) {
    if (currentCursor >= currentInput.length) {
      return state;
    }
    const nextInput = currentInput.slice(0, currentCursor) + currentInput.slice(currentCursor + 1);
    return {
      input: nextInput,
      cursor: clampCursor(currentCursor, nextInput)
    };
  }

  if (!key.ctrl && !key.meta && !key.return && char && !isEscapedInput(char)) {
    const nextInput = currentInput.slice(0, currentCursor) + char + currentInput.slice(currentCursor);
    return {
      input: nextInput,
      cursor: clampCursor(currentCursor + char.length, nextInput)
    };
  }

  return state;
}

export function useConsoleInput(initialValue = "") {
  const [input, setInputState] = useState(initialValue);
  const inputRef = useRef(initialValue);

  const setInput = (next: string) => {
    inputRef.current = next;
    setInputState(next);
  };

  const [cursor, setCursorState] = useState(0);
  const cursorRef = useRef(0);

  const setCursor = (next: number) => {
    const clamped = clampCursor(next, inputRef.current);
    cursorRef.current = clamped;
    setCursorState(clamped);
  };

  const reset = () => {
    setInput("");
    setCursor(0);
  };

  const applyKey = (char: string, key: InputKey): boolean => {
    const next = applyInputKey({ input: inputRef.current, cursor: cursorRef.current }, char, key);
    if (next.input === inputRef.current && next.cursor === cursorRef.current) {
      return false;
    }

    setInput(next.input);
    setCursor(next.cursor);
    return true;
  };

  return {
    input,
    cursor,
    setInput,
    setCursor,
    reset,
    applyKey
  };
}
