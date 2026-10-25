import { z } from "zod";
import type { ToolCall } from "../core/messageTypes.js";

export const finalToolSchema = z.object({
  answer: z.string().trim().min(1),
  incomplete: z.boolean().optional().describe("Set true when blocked or unable to verify; explain remaining work.")
});

export function parseTextAction(text: string): ToolCall {
  const trimmed = text.trim();
  const source = trimmed.match(/^```(?:json|text)?\s*\n([\s\S]*)\n```$/i)?.[1] ?? trimmed;
  let actionSource = source;
  if (/^Thought:/i.test(source)) {
    const start = source.search(/^Action:/im);
    if (start < 0) throw new Error('Missing Action. Use Action: <tool> and Action Input: {"key":"value"}.');
    actionSource = source.slice(start);
  }
  const action = actionSource.match(/^Action:[ \t]*([\w-]+)(?:[ \t]+(\{[^\n]*\}))?[ \t]*(?:\nAction Input:[ \t]*([\s\S]*))?$/i);
  if (!action) {
    if (!source || /^(Thought|Action|Action Input):/i.test(source)) throw new Error('Missing Action. Use Action: <tool> and Action Input: {"key":"value"}.');
    return { name: "final", input: { answer: source } };
  }
  if (action[2] && action[3]) throw new Error("Use one Action Input object, not duplicate inputs.");
  let input: unknown;
  try { input = JSON.parse((action[3] ?? action[2] ?? "{}").trim()); }
  catch { throw new Error("Invalid Action Input JSON. Retry with an object matching the tool schema."); }
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Action Input must be a JSON object.");
  return { name: action[1], input };
}
