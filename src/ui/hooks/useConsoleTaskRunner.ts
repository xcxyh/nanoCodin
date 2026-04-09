import { useReducer, useRef } from "react";
import type { CodingAgentGraph } from "../../agent/agentGraph.js";
import type { Message } from "../../core/messageTypes.js";
import {
  initialUiState,
  uiReducer
} from "../state/consoleUiReducer.js";
import { mapAgentEventToUiActions as mapEvent } from "../state/eventMapper.js";

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function useConsoleTaskRunner({
  graph,
  resumeSessionId,
  disableCheckpointRestore
}: {
  graph: CodingAgentGraph;
  resumeSessionId?: string;
  disableCheckpointRestore?: boolean;
}) {
  const [uiState, dispatch] = useReducer(uiReducer, initialUiState);
  const activeRunIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const cancelRequestedRef = useRef(false);

  async function runTask(task: string) {
    const runId = activeRunIdRef.current + 1;
    activeRunIdRef.current = runId;
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    cancelRequestedRef.current = false;

    dispatch({ type: "task_start", task });

    const initialMessages: Message[] = [{ role: "user", content: task }];

    try {
      const result = await graph.run({
        messages: initialMessages,
        checkpointRestore: disableCheckpointRestore
          ? "disabled"
          : resumeSessionId
            ? (resumeSessionId === "__LATEST__" ? "latest" : "session")
            : "auto",
        resumeSessionId: resumeSessionId && resumeSessionId !== "__LATEST__" ? resumeSessionId : undefined,
        abortSignal: abortController.signal,
        onEvent: (event) => {
          if (runId !== activeRunIdRef.current || cancelRequestedRef.current) {
            return;
          }

          const actions = mapEvent(event);
          for (const uiAction of actions) {
            dispatch(uiAction);
          }
        }
      });

      if (runId !== activeRunIdRef.current) {
        return;
      }

      if (abortController.signal.aborted || cancelRequestedRef.current) {
        dispatch({ type: "task_cancel" });
        return;
      }

      dispatch({ type: "task_success", stepCount: result.steps.length });
    } catch (error) {
      if (runId !== activeRunIdRef.current) {
        return;
      }

      if (abortController.signal.aborted || cancelRequestedRef.current || isAbortError(error)) {
        dispatch({ type: "task_cancel" });
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      dispatch({ type: "task_failure", message });
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
      cancelRequestedRef.current = false;
    }
  }

  function requestCancel() {
    if (!uiState.busy || cancelRequestedRef.current) {
      return false;
    }

    cancelRequestedRef.current = true;
    abortControllerRef.current?.abort();
    dispatch({ type: "task_cancel_requested" });
    return true;
  }

  return {
    uiState,
    runTask,
    requestCancel
  };
}
