import type { Tool } from "../core/toolTypes.js";
/** Infer tool input from its schema while keeping the registration contract explicit. */
export function defineTool<T>(definition: Tool<T>): Tool<T> { return definition; }
