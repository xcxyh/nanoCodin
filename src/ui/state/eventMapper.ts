import type { AgentEvent } from "../../agent/reactLoop.js";
import type { UiAction } from "./consoleUiReducer.js";

export function mapAgentEventToUiActions(event: AgentEvent): UiAction[] {
  if (event.type === "thought") {
    return [{ type: "append_thought", text: event.thought }];
  }
  if (event.type === "action") {
    return [{ type: "append_action", name: event.action.name, input: event.action.input }];
  }
  if (event.type === "observation") {
    return [{ type: "append_observation", text: event.observation }];
  }
  if (event.type === "error") {
    return [{ type: "append_error", text: event.error }];
  }
  if (event.type === "state") {
    return [{ type: "set_snapshot", snapshot: event.snapshot }];
  }
  return [{ type: "append_final", text: event.answer }];
}
