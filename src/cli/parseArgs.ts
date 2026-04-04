import path from "node:path";

const CONFIG_FLAGS_WITH_VALUES = new Set([
  "max-steps",
  "recursion-limit",
  "sandbox-policy",
  "sandbox-timeout-ms",
  "compression-threshold",
  "verify-keywords"
]);

export interface ParsedCliArgs {
  cwd: string;
  configArgv: string[];
  prompt: string | null;
  resume: { enabled: boolean; sessionId: string | null };
  newSession: boolean;
  printHelp: boolean;
  printVersion: boolean;
  printConfig: boolean;
  warnings: string[];
}

export interface ParseCliResult {
  ok: boolean;
  args?: ParsedCliArgs;
  error?: string;
}

export function parseCliArgs(argv: string[], baseCwd: string): ParseCliResult {
  let cwd = baseCwd;
  let promptFromFlag: string | null = null;
  const positionalParts: string[] = [];
  let resumeEnabled = false;
  let resumeSessionId: string | null = null;
  let newSession = false;
  let printHelp = false;
  let printVersion = false;
  let printConfig = false;
  const warnings: string[] = [];
  const configArgv: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const rawArg = argv[index];

    if (!rawArg.startsWith("-")) {
      positionalParts.push(rawArg);
      continue;
    }

    if (rawArg === "--") {
      positionalParts.push(...argv.slice(index + 1));
      break;
    }

    if (rawArg === "-h" || rawArg === "--help") {
      printHelp = true;
      continue;
    }
    if (rawArg === "-v" || rawArg === "--version") {
      printVersion = true;
      continue;
    }
    if (rawArg === "--print-config") {
      printConfig = true;
      continue;
    }
    if (rawArg === "--new-session") {
      newSession = true;
      continue;
    }

    if (rawArg === "--cwd" || rawArg.startsWith("--cwd=")) {
      const value = readFlagValue(argv, index, "cwd");
      if (!value.ok) {
        return { ok: false, error: value.error };
      }
      cwd = path.resolve(baseCwd, value.value);
      index += value.consumedNext ? 1 : 0;
      continue;
    }

    if (rawArg === "--prompt" || rawArg.startsWith("--prompt=")) {
      const value = readFlagValue(argv, index, "prompt");
      if (!value.ok) {
        return { ok: false, error: value.error };
      }
      promptFromFlag = value.value;
      index += value.consumedNext ? 1 : 0;
      continue;
    }

    if (rawArg === "--resume" || rawArg.startsWith("--resume=")) {
      resumeEnabled = true;
      if (rawArg.includes("=")) {
        const [, value = ""] = rawArg.split("=", 2);
        resumeSessionId = value.trim() || null;
        continue;
      }

      const nextArg = argv[index + 1];
      if (nextArg && !nextArg.startsWith("-")) {
        resumeSessionId = nextArg;
        index += 1;
      }
      continue;
    }

    const normalizedFlag = rawArg.startsWith("--") ? rawArg.slice(2).split("=", 1)[0] : "";
    if (CONFIG_FLAGS_WITH_VALUES.has(normalizedFlag)) {
      const value = readFlagValue(argv, index, normalizedFlag);
      if (!value.ok) {
        return { ok: false, error: value.error };
      }
      configArgv.push(`--${normalizedFlag}=${value.value}`);
      index += value.consumedNext ? 1 : 0;
      continue;
    }

    return {
      ok: false,
      error: `Unknown option: ${rawArg}\nRun 'nano-codin --help' to see available options.`
    };
  }

  const promptFromPositionals = positionalParts.length > 0 ? positionalParts.join(" ") : null;
  const prompt = promptFromFlag ?? promptFromPositionals;
  if (promptFromFlag && promptFromPositionals) {
    warnings.push("Ignoring positional prompt because --prompt was provided.");
  }
  if (resumeEnabled && prompt) {
    warnings.push("Ignoring prompt input because --resume was provided.");
  }
  if (resumeEnabled && newSession) {
    warnings.push("Ignoring --new-session because --resume was provided.");
  }

  return {
    ok: true,
    args: {
      cwd,
      configArgv,
      prompt: resumeEnabled ? null : prompt,
      resume: { enabled: resumeEnabled, sessionId: resumeSessionId },
      newSession: resumeEnabled ? false : newSession,
      printHelp,
      printVersion,
      printConfig,
      warnings
    }
  };
}

function readFlagValue(argv: string[], index: number, flagName: string) {
  const rawArg = argv[index] ?? "";
  if (rawArg.includes("=")) {
    const [, value = ""] = rawArg.split("=", 2);
    if (value.length === 0) {
      return { ok: false as const, error: `Missing value for --${flagName}.` };
    }
    return { ok: true as const, value, consumedNext: false };
  }

  const nextArg = argv[index + 1];
  if (!nextArg || nextArg.startsWith("-")) {
    return { ok: false as const, error: `Missing value for --${flagName}.` };
  }
  return { ok: true as const, value: nextArg, consumedNext: true };
}
