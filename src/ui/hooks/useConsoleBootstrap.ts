import { useEffect, useRef } from "react";

export function useConsoleBootstrap({
  initialTask,
  resumeSessionId,
  runTask
}: {
  initialTask?: string;
  resumeSessionId?: string;
  runTask: (task: string) => Promise<void>;
}) {
  const bootstrappedRef = useRef(false);

  useEffect(() => {
    if (bootstrappedRef.current) {
      return;
    }
    if (!initialTask && !resumeSessionId) {
      return;
    }

    bootstrappedRef.current = true;
    void runTask(initialTask ?? "continue");
  }, [initialTask, resumeSessionId, runTask]);
}
