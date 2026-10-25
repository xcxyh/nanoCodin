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

/** Split simple command lists without inspecting quoted argument contents as commands. */
export function splitCommandList(command: string): string[] | null {
  const parts: string[] = []; let quote = ""; let start = 0;
  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (char === "\\" && quote !== "'") { i++; continue; }
    if (quote) { if (char === quote) quote = ""; continue; }
    if (char === "'" || char === '"') { quote = char; continue; }
    if (/[;|&\n]/.test(char)) {
      if (char === "&" && command[i + 1] !== "&") return null;
      parts.push(command.slice(start, i).trim());
      if ((char === "&" || char === "|") && command[i + 1] === char) i++;
      start = i + 1;
    }
  }
  if (quote) return null;
  parts.push(command.slice(start).trim());
  return parts.filter(Boolean);
}
