import type { RunnableConfig } from "@langchain/core/runnables";
import { LangChainTracer } from "@langchain/core/tracers/tracer_langchain";

function isTruthy(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function isLangSmithTracingEnabled(): boolean {
  return isTruthy(process.env.LANGSMITH_TRACING) || isTruthy(process.env.LANGCHAIN_TRACING_V2);
}

function hasLangSmithApiKey(): boolean {
  return Boolean(process.env.LANGSMITH_API_KEY || process.env.LANGCHAIN_API_KEY);
}

export function createLangSmithRunnableConfig(
  runName: string,
  metadata: Record<string, unknown>
): RunnableConfig | undefined {
  if (!isLangSmithTracingEnabled() || !hasLangSmithApiKey()) {
    return undefined;
  }

  const projectName = process.env.LANGSMITH_PROJECT ?? process.env.LANGCHAIN_PROJECT ?? "nano-codin";
  const tracer = new LangChainTracer({ projectName });

  return {
    runName,
    callbacks: [tracer],
    metadata
  };
}
