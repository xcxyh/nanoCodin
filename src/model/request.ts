import { displayEndpoint } from "../config/model.js";
import { ModelRequestError, type ModelFailure, type ModelResponse, type RequestInfo } from "../core/messageTypes.js";
import { DEFAULT_MODEL_REQUEST_POLICY, type ResolvedModelConfig } from "../core/runtimeConfig.js";

export const DEFAULT_REQUEST_POLICY = DEFAULT_MODEL_REQUEST_POLICY;
export function requestPolicy(config: Partial<ResolvedModelConfig>) {
  const policy = { requestTimeoutMs: config.requestTimeoutMs ?? DEFAULT_REQUEST_POLICY.requestTimeoutMs,
    idleTimeoutMs: config.idleTimeoutMs ?? DEFAULT_REQUEST_POLICY.idleTimeoutMs, maxRetries: config.maxRetries ?? DEFAULT_REQUEST_POLICY.maxRetries };
  for (const [name, value] of Object.entries(policy)) {
    if (!Number.isInteger(value) || value < (name === "maxRetries" ? 0 : 1) || value > (name === "maxRetries" ? 5 : 3_600_000)) throw new Error(`Invalid model.${name}.`);
  }
  return policy;
}

/** One logical request owns the budget across fallback and transport retries. No tools execute here. */
export async function runModelRequest(config: ResolvedModelConfig, parent: AbortSignal | undefined,
  generate: (transport: { signal: AbortSignal; fetch: typeof fetch }) => Promise<ModelResponse>): Promise<ModelResponse> {
  const policy = requestPolicy(config);
  const started = Date.now();
  const controller = new AbortController();
  let scope: "total" | "idle" | undefined;
  let idle: ReturnType<typeof setTimeout> | undefined;
  let retryAfter = 0;
  const info: RequestInfo = { attempts: 0, durationMs: 0, receivedBytes: 0 };
  const expire = (kind: typeof scope) => { if (controller.signal.aborted) return; scope = kind; controller.abort(new DOMException(`Model ${kind} timeout`, "TimeoutError")); };
  const total = setTimeout(() => expire("total"), policy.requestTimeoutMs);
  const cancel = () => controller.abort(parent?.reason);
  parent?.addEventListener("abort", cancel, { once: true });
  if (parent?.aborted) cancel();
  const touch = () => {
    if (idle) clearTimeout(idle);
    info.lastResponseMs = Date.now() - started;
    idle = setTimeout(() => expire("idle"), policy.idleTimeoutMs);
  };
  const transportFetch: typeof fetch = async (input, init) => {
    controller.signal.throwIfAborted(); info.attempts++; info.httpStatus = undefined; info.requestId = undefined; touch();
    const signal = init?.signal ? AbortSignal.any([controller.signal, init.signal]) : controller.signal;
    const response = await globalThis.fetch(input, { ...init, signal });
    info.httpStatus = response.status;
    info.requestId = response.headers.get("x-request-id") ?? response.headers.get("request-id") ?? undefined;
    info.firstResponseMs ??= Date.now() - started; touch();
    const retry = response.headers.get("retry-after");
    retryAfter = retry === null ? 0 : /^\d+(?:\.\d+)?$/.test(retry) ? Number(retry) * 1000 : Math.max(0, Date.parse(retry) - Date.now()) || 0;
    if (!response.body) return response;
    let responseBytes = 0;
    const reader = response.body.getReader();
    const abort = () => { void reader.cancel(signal.reason).catch(() => {}); };
    signal.addEventListener("abort", abort, { once: true });
    const cleanup = () => { signal.removeEventListener("abort", abort); reader.releaseLock(); };
    const body = new ReadableStream<Uint8Array>({
      async pull(stream) {
        try {
          signal.throwIfAborted();
          const next = await reader.read(); signal.throwIfAborted();
          if (next.done) { stream.close(); cleanup(); return; }
          responseBytes += next.value.byteLength;
          if (responseBytes > 8 * 1024 * 1024) { await reader.cancel("Response exceeds 8 MiB"); throw new Error("Model response exceeds 8 MiB"); }
          info.receivedBytes += next.value.byteLength; touch(); stream.enqueue(next.value);
        } catch (error) { stream.error(error); cleanup(); }
      },
      cancel(reason) { signal.removeEventListener("abort", abort); return reader.cancel(reason).finally(() => reader.releaseLock()); }
    });
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  };
  let rejectAbort!: (error: unknown) => void;
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
  const onAbort = () => rejectAbort(controller.signal.reason);
  controller.signal.addEventListener("abort", onAbort, { once: true });
  try {
    for (let retry = 0; ; retry++) {
      try {
        controller.signal.throwIfAborted(); touch();
        const response = await Promise.race([generate({ signal: controller.signal, fetch: transportFetch }), aborted]);
        return { ...response, request: { ...info, durationMs: Date.now() - started } };
      } catch (cause) {
        if (idle) clearTimeout(idle);
        const failure = classify(cause, parent?.aborted === true, scope, { ...info, durationMs: Date.now() - started });
        if (!controller.signal.aborted && failure.retryable && retry < policy.maxRetries) {
          const wait = Math.max(retryAfter, Math.min(500 * 2 ** retry, 5000));
          let timer: ReturnType<typeof setTimeout> | undefined;
          try { await Promise.race([new Promise((resolve) => { timer = setTimeout(resolve, wait); }), aborted]); }
          catch (error) { throw failureError(config, classify(error, parent?.aborted === true, scope, { ...info, durationMs: Date.now() - started }), error); }
          finally { if (timer) clearTimeout(timer); }
          continue;
        }
        throw failureError(config, failure, cause);
      }
    }
  } finally {
    clearTimeout(total); if (idle) clearTimeout(idle);
    parent?.removeEventListener("abort", cancel); controller.signal.removeEventListener("abort", onAbort);
  }
}
function classify(error: unknown, cancelled: boolean, scope: "total" | "idle" | undefined, info: RequestInfo): ModelFailure {
  const cause = error as { statusCode?: number; name?: string; message?: string; isRetryable?: boolean } | null;
  const status = cause?.statusCode ?? info.httpStatus;
  const message = cause?.message ?? String(error);
  const kind = cancelled ? "cancelled" : scope || cause?.name === "TimeoutError" || status === 408 ? "timeout" : status === 401 || status === 402 || status === 403 ? "auth" : status === 429 ? "rate_limit"
    : status && status >= 500 ? "provider" : status && status >= 400 ? "protocol"
    : /fetch failed|ECONN|ENOTFOUND|ETIMEDOUT|socket|network|connection/i.test(message) ? "network" : "protocol";
  return { ...info, kind, retryable: (kind === "timeout" && !scope) || kind === "rate_limit" || kind === "network" || (kind === "provider" && cause?.isRetryable !== false), timeoutScope: kind === "timeout" ? scope : undefined };
}
function failureError(config: ResolvedModelConfig, failure: ModelFailure, cause: unknown) {
  const hints = { timeout: "模型请求超时；操作记录已保留，可恢复会话继续。", cancelled: "模型请求已取消。", auth: "模型认证或权限失败，请检查该提供商的凭据。",
    rate_limit: "模型请求被限流，请稍后恢复会话。", network: "模型连接失败，请检查网络后恢复会话。", provider: "模型服务暂时失败，请稍后恢复会话。", protocol: "模型协议或请求被拒绝，请检查接口、模型和工具 schema。" };
  const endpoint = displayEndpoint(config.baseUrl);
  let detail = cause instanceof Error ? cause.message : String(cause);
  if (cause instanceof Error && (/JSONParse|TypeValidation|InvalidResponseData/.test(cause.name) || /JSON parsing failed|Type validation failed|Invalid JSON response/i.test(detail))) detail = "模型返回数据不符合协议，原始响应内容未输出。";
  if (config.apiKey) detail = detail.replaceAll(config.apiKey, "[redacted]");
  if (config.baseUrl) detail = detail.replaceAll(config.baseUrl, endpoint);
  detail = detail.replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]").slice(0, 180);
  failure = { ...failure, detail };
  const hint = failure.httpStatus === 402 ? "模型账户额度不足，请检查服务商余额和额度。" : hints[failure.kind];
  const message = `LLM request failed for provider=${config.provider} | model=${config.name} | baseURL=${endpoint} | kind=${failure.kind}${failure.timeoutScope ? `(${failure.timeoutScope})` : ""} | attempts=${failure.attempts} | elapsed=${failure.durationMs}ms${failure.httpStatus ? ` | status=${failure.httpStatus}` : ""} | ${hint}${!["timeout", "cancelled"].includes(failure.kind) ? ` | detail=${detail}` : ""}`;
  return new ModelRequestError(message, failure, { cause });
}
