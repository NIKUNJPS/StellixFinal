import { apiFetch, errorMessage } from "@/lib/api-client";
import type {
  AuditLogListResponse,
  ChatStreamEvent,
  ChatStreamRequest,
  CritiqueResponse,
  GraphSummaryResponse,
  HypothesisRequest,
  HypothesisResponse,
} from "@/lib/llm-types";

/**
 * Stream a research-chat answer (Batch 18), yielding each decoded SSE frame.
 *
 * Uses apiFetch like every other call here, so the request still carries the
 * Bearer token and still gets the transparent refresh-once-on-401 retry. apiFetch
 * only reads the body on a non-OK response, so the stream is untouched on success.
 *
 * A price-prediction prompt is rejected by the backend with a real 400 before the
 * stream opens (Safeguard 1), which surfaces here as a thrown error rather than an
 * error frame — the same shape as every other rejected call in this module.
 */
export async function* streamChat(
  payload: ChatStreamRequest,
  signal?: AbortSignal,
): AsyncGenerator<ChatStreamEvent> {
  const res = await apiFetch("/llm/chat/stream", {
    method: "POST",
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to start chat stream"));
  if (!res.body) throw new Error("Chat stream returned no body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE frames are separated by a blank line. Split on that and keep the
      // trailing partial in the buffer — a frame can be split across TCP reads,
      // and parsing half a frame as JSON would throw mid-stream.
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const line = frame.trim();
        if (!line.startsWith("data: ")) continue;
        yield JSON.parse(line.slice(6)) as ChatStreamEvent;
      }
    }
  } finally {
    // Releases the connection if the consumer breaks early (component unmount,
    // user abort) instead of leaving the response body locked open.
    reader.releaseLock();
  }
}

export async function generateHypothesis(payload: HypothesisRequest): Promise<HypothesisResponse> {
  const res = await apiFetch("/llm/hypothesis", { method: "POST", body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to generate hypothesis"));
  return (await res.json()) as HypothesisResponse;
}

export async function critiqueStrategy(strategyId: string): Promise<CritiqueResponse> {
  const res = await apiFetch(`/llm/critique/${strategyId}`, { method: "POST" });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to critique strategy"));
  return (await res.json()) as CritiqueResponse;
}

export async function getGraphSummary(queryName: string, resultId?: string): Promise<GraphSummaryResponse> {
  const params = new URLSearchParams({ query_name: queryName });
  if (resultId) params.set("result_id", resultId);
  const res = await apiFetch(`/llm/graph-summary?${params.toString()}`);
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to summarize query result"));
  return (await res.json()) as GraphSummaryResponse;
}

export async function getAuditLog(params: {
  function_name?: string;
  user_id?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<AuditLogListResponse> {
  const search = new URLSearchParams();
  if (params.function_name) search.set("function_name", params.function_name);
  if (params.user_id) search.set("user_id", params.user_id);
  if (params.limit) search.set("limit", String(params.limit));
  if (params.offset) search.set("offset", String(params.offset));
  const res = await apiFetch(`/llm/audit-log?${search.toString()}`);
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load audit log"));
  return (await res.json()) as AuditLogListResponse;
}
