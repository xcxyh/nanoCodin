import type { ToolCall } from "../core/messageTypes.js";

export function parseTextAction(text: string): ToolCall {
  const source = text.trim().replace(/^```(?:json|text)?\s*\n/i, "").replace(/\n```$/, "");
  const action = source.match(/^Action:[ \t]*([\w-]+)(?:[ \t]+(\{[^\n]*\}))?[ \t]*$/im);
  if (!action) {
    if (!source || /^(Thought|Action|Action Input):/im.test(source)) throw new Error('Missing Action. Use Action: <tool> and Action Input: {"key":"value"}.');
    return { name: "final", input: { answer: source } };
  }
  let input: unknown;
  try { input = JSON.parse((source.match(/^Action Input:[ \t]*([\s\S]*)$/im)?.[1] ?? action[2] ?? "{}").trim()); }
  catch { throw new Error("Invalid Action Input JSON. Retry with an object matching the tool schema."); }
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Action Input must be a JSON object.");
  return { name: action[1], input };
}
