/** Decode simple words without evaluating variables or shell control syntax. */
export function splitSingleCommand(command: string, allowPatterns = true): string[] | null {
  const words: string[] = [];
  let word = "";
  let started = false;
  let quote = "";
  const flush = () => { if (started) words.push(word); word = ""; started = false; };
  for (let index = 0; index < command.length; index++) {
    const char = command[index];
    if (char === "\\" && quote !== "'") {
      const next = command[++index];
      if (next === undefined || /[\r\n]/.test(next)) return null;
      // In double quotes bash preserves backslashes before ordinary characters.
      word += quote === '"' && !/[$`"\\]/.test(next) ? `\\${next}` : next;
      started = true;
    } else if (quote) {
      if (char === quote) quote = "";
      else if (quote === '"' && /[$`]/.test(char)) return null;
      else word += char;
    } else if (char === "'" || char === '"') { quote = char; started = true; }
    else if (/[;&|`$><()\n\r]/.test(char)) return null;
    else if (!allowPatterns && /[*?\[\]{}]/.test(char)) return null;
    else if (/\s/.test(char)) flush();
    else { word += char; started = true; }
  }
  if (quote) return null;
  flush();
  // These are shell control constructs, not ordinary executable words.
  return ["!", "coproc"].includes(words[0]) ? null : words;
}

export function isSingleCommand(command: string): boolean {
  return (splitSingleCommand(command)?.length ?? 0) > 0;
}
