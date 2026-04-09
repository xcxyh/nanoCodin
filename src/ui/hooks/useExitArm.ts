import { useEffect, useRef, useState } from "react";

const EXIT_ARM_WINDOW_MS = 1500;

export function useExitArm() {
  const [exitArmedAt, setExitArmedAt] = useState<number | null>(null);
  const exitArmedAtRef = useRef<number | null>(null);

  const clearExitArm = () => {
    if (exitArmedAtRef.current !== null) {
      exitArmedAtRef.current = null;
      setExitArmedAt(null);
    }
  };

  const armExit = () => {
    const now = Date.now();
    exitArmedAtRef.current = now;
    setExitArmedAt(now);
  };

  const shouldExit = () => {
    const armedAt = exitArmedAtRef.current;
    const now = Date.now();
    if (armedAt && now - armedAt <= EXIT_ARM_WINDOW_MS) {
      return true;
    }
    armExit();
    return false;
  };

  useEffect(() => {
    if (exitArmedAt === null) {
      return undefined;
    }

    const timeout = setTimeout(() => {
      if (exitArmedAtRef.current === exitArmedAt) {
        clearExitArm();
      }
    }, EXIT_ARM_WINDOW_MS);

    return () => clearTimeout(timeout);
  }, [exitArmedAt]);

  return {
    exitArmedAt,
    clearExitArm,
    shouldExit
  };
}
