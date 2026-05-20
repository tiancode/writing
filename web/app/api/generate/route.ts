import { NextRequest } from "next/server";
import { getAnthropicClient } from "@/lib/anthropic";
import {
  loadScenario,
  buildRequirement,
  buildSystemPrompt,
} from "@/lib/scenarios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface Followup {
  output: string;
  instruction: string;
}

interface GenerateRequest {
  scenarioId: string;
  formData: Record<string, string>;
  followups?: Followup[];
}

const MAX_INPUT_CHARS = 40_000;
const MAX_FOLLOWUPS = 5;
const RATE_LIMIT_PER_HOUR = 30;

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRate(ip: string): { ok: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(ip, { count: 1, resetAt: now + 3_600_000 });
    return { ok: true };
  }
  if (bucket.count >= RATE_LIMIT_PER_HOUR) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count++;
  return { ok: true };
}

function sseEvent(type: string, data: unknown): string {
  return `data: ${JSON.stringify({ type, ...(typeof data === "object" && data !== null ? data : { content: data }) })}\n\n`;
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const rate = checkRate(ip);
  if (!rate.ok) {
    return new Response(
      JSON.stringify({ error: `请求过于频繁，请 ${rate.retryAfterSec} 秒后再试` }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(rate.retryAfterSec ?? 60),
        },
      }
    );
  }

  let body: GenerateRequest;
  try {
    body = (await req.json()) as GenerateRequest;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const { scenarioId, formData, followups = [] } = body;
  if (!scenarioId || !formData) {
    return new Response("Missing scenarioId or formData", { status: 400 });
  }

  if (followups.length > MAX_FOLLOWUPS) {
    return new Response(
      JSON.stringify({ error: `单次会话最多 ${MAX_FOLLOWUPS} 轮续写，请重新开始` }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  let scenario;
  try {
    scenario = await loadScenario(scenarioId);
  } catch (err) {
    return new Response(`Scenario not found: ${(err as Error).message}`, {
      status: 404,
    });
  }

  const missing = scenario.form.fields
    .filter((f) => f.required)
    .filter((f) => {
      if (f.showIf && formData[f.showIf.field] !== f.showIf.equals) return false;
      return !formData[f.id]?.trim();
    })
    .map((f) => f.label);

  if (missing.length > 0) {
    return new Response(
      JSON.stringify({ error: `缺少必填项：${missing.join("、")}` }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const requirement = buildRequirement(scenario, formData);

  const totalChars =
    requirement.length +
    followups.reduce((s, f) => s + f.output.length + f.instruction.length, 0);
  if (totalChars > MAX_INPUT_CHARS) {
    return new Response(
      JSON.stringify({
        error: `输入过长（${totalChars} 字符，上限 ${MAX_INPUT_CHARS}），请精简后再试`,
      }),
      { status: 413, headers: { "Content-Type": "application/json" } }
    );
  }

  const systemPrompt = buildSystemPrompt(scenario);

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [
    { role: "user", content: requirement },
  ];
  for (const fu of followups) {
    messages.push({ role: "assistant", content: fu.output });
    messages.push({ role: "user", content: fu.instruction });
  }

  let client;
  try {
    client = getAnthropicClient();
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (type: string, data: unknown) => {
        controller.enqueue(encoder.encode(sseEvent(type, data)));
      };

      try {
        send("start", { scenario: scenario.id });

        const apiStream = client.messages.stream({
          model: process.env.ANTHROPIC_MODEL || scenario.form.model,
          max_tokens: scenario.form.maxTokens,
          temperature: scenario.form.temperature,
          system: [
            {
              type: "text",
              text: systemPrompt,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages,
        });

        apiStream.on("text", (text) => {
          send("text", text);
        });

        const finalMsg = await apiStream.finalMessage();
        const usage = finalMsg.usage;
        send("done", {
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          cacheReadTokens: usage.cache_read_input_tokens ?? 0,
          cacheCreateTokens: usage.cache_creation_input_tokens ?? 0,
          stopReason: finalMsg.stop_reason,
        });
      } catch (err) {
        send("error", { message: (err as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
