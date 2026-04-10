type YamlPrimitive = string | number | boolean | null;
type YamlValue = YamlPrimitive | YamlValue[] | { [key: string]: YamlValue };

function parseScalar(rawValue: string): YamlValue {
  const value = rawValue.trim();
  if (!value.length) {
    return "";
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (value === "null") {
    return null;
  }
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (value.startsWith("[") && value.endsWith("]")) {
    const body = value.slice(1, -1).trim();
    if (!body) {
      return [];
    }
    return body.split(",").map((item) => parseScalar(item));
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric;
  }
  return value;
}

function formatScalar(value: YamlPrimitive): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    if (/^[A-Za-z0-9._/@:-]+$/.test(value)) {
      return value;
    }
    return JSON.stringify(value);
  }
  return String(value);
}

export function parseSimpleYaml(text: string): Record<string, YamlValue> {
  const root: Record<string, YamlValue> = {};
  const stack: Array<{ indent: number; target: Record<string, YamlValue> }> = [{ indent: -1, target: root }];

  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) {
      continue;
    }

    const indent = rawLine.match(/^ */)?.[0].length ?? 0;
    const line = rawLine.trim();
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }

    while (stack.length > 1 && indent <= stack[stack.length - 1]!.indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1]!.target;
    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();

    if (!rawValue) {
      const next: Record<string, YamlValue> = {};
      parent[key] = next;
      stack.push({ indent, target: next });
      continue;
    }

    parent[key] = parseScalar(rawValue);
  }

  return root;
}

export function stringifySimpleYaml(input: Record<string, YamlValue>, indent = 0): string {
  const lines: string[] = [];
  const prefix = " ".repeat(indent);

  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) {
      lines.push(`${prefix}${key}: [${value.map((item) => formatScalar(item as YamlPrimitive)).join(", ")}]`);
      continue;
    }

    if (value && typeof value === "object") {
      lines.push(`${prefix}${key}:`);
      lines.push(stringifySimpleYaml(value as Record<string, YamlValue>, indent + 2));
      continue;
    }

    lines.push(`${prefix}${key}: ${formatScalar(value as YamlPrimitive)}`);
  }

  return lines.filter(Boolean).join("\n");
}
