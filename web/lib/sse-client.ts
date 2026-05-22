// Client-side helper for the /api/generate SSE stream. Shared by the main
// scenario form and the section editor so the parsing / cancellation logic
// lives in one place.

export interface GenerateBody {
  scenarioId: string;
  formData?: Record<string, string>;
  followups?: { output: string; instruction: string }[];
  rewrite?: { fullDocument: string; section: string; instruction: string };
}

export interface DoneInfo {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreateTokens: number;
  creditsCharged: number | null;
  creditsRemaining: number | null;
}

export interface StreamHandlers {
  signal?: AbortSignal;
  /** Called on every text delta with the full accumulated text so far. */
  onText: (accumulated: string) => void;
  onDone?: (info: DoneInfo) => void;
}

/**
 * POST to /api/generate and consume the SSE stream. Resolves with the full
 * accumulated text on success; rejects on HTTP error, server "error" event,
 * or if the stream ends before a "done" event (dropped connection).
 */
export async function streamGenerate(
  body: GenerateBody,
  handlers: StreamHandlers
): Promise<{ text: string; done: DoneInfo | null }> {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: handlers.signal,
  });

  if (!res.ok) {
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      throw new Error(json.error || text);
    } catch (e) {
      if (e instanceof Error && e.message && e.message !== text) throw e;
      throw new Error(text || `HTTP ${res.status}`);
    }
  }
  if (!res.body) throw new Error("No response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";
  let doneInfo: DoneInfo | null = null;
  let receivedDone = false;

  try {
    outer: while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (!chunk.startsWith("data: ")) continue;
        const payload = chunk.slice(6);
        let evt: Record<string, unknown>;
        try {
          evt = JSON.parse(payload);
        } catch {
          continue;
        }
        if (evt.type === "text") {
          accumulated += evt.content as string;
          handlers.onText(accumulated);
        } else if (evt.type === "done") {
          receivedDone = true;
          doneInfo = {
            inputTokens: (evt.inputTokens as number) ?? 0,
            outputTokens: (evt.outputTokens as number) ?? 0,
            cacheReadTokens: (evt.cacheReadTokens as number) ?? 0,
            cacheCreateTokens: (evt.cacheCreateTokens as number) ?? 0,
            creditsCharged: (evt.creditsCharged as number | null) ?? null,
            creditsRemaining: (evt.creditsRemaining as number | null) ?? null,
          };
          handlers.onDone?.(doneInfo);
          break outer;
        } else if (evt.type === "error") {
          throw new Error((evt.message as string) || "生成出错");
        }
      }
    }
    if (!receivedDone) throw new Error("连接中断，生成未完成");
  } finally {
    try {
      await reader.cancel();
    } catch {
      // already closed
    }
  }

  return { text: accumulated, done: doneInfo };
}
