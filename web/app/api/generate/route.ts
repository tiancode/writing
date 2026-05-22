import { NextRequest } from "next/server";
import { getAnthropicClient } from "@/lib/anthropic";
import {
  loadScenario,
  buildRequirement,
  buildSystemPrompt,
  buildRewriteSystemPrompt,
  buildRewriteRequirement,
} from "@/lib/scenarios";
import { getUserFromRequest } from "@/lib/session";
import { chargeUsage, getBalance } from "@/lib/repository";
import { MIN_BALANCE_TO_START } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface Followup {
  output: string;
  instruction: string;
}

interface RewritePayload {
  fullDocument: string;
  section: string;
  instruction: string;
}

interface GenerateRequest {
  scenarioId: string;
  formData: Record<string, string>;
  followups?: Followup[];
  rewrite?: RewritePayload;
}

const MAX_INPUT_CHARS = 40_000;
const MAX_REWRITE_CHARS = 60_000;
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

function jsonError(message: string, status: number, extraHeaders?: Record<string, string>) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

export async function POST(req: NextRequest) {
  const user = getUserFromRequest(req);

  // Anonymous users are throttled by IP; logged-in users are metered by credits.
  if (!user) {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const rate = checkRate(ip);
    if (!rate.ok) {
      return jsonError(`请求过于频繁，请 ${rate.retryAfterSec} 秒后再试`, 429, {
        "Retry-After": String(rate.retryAfterSec ?? 60),
      });
    }
  } else if (getBalance(user.id) < MIN_BALANCE_TO_START) {
    return jsonError("额度不足，请充值后再试", 402);
  }

  let body: GenerateRequest;
  try {
    body = (await req.json()) as GenerateRequest;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const { scenarioId, formData, followups = [], rewrite } = body;
  if (!scenarioId) {
    return new Response("Missing scenarioId", { status: 400 });
  }

  let scenario;
  try {
    scenario = await loadScenario(scenarioId);
  } catch (err) {
    return new Response(`Scenario not found: ${(err as Error).message}`, {
      status: 404,
    });
  }

  let systemPrompt: string;
  let messages: Array<{ role: "user" | "assistant"; content: string }>;
  const kind = rewrite ? "edit-section" : "generate";

  if (rewrite) {
    const { fullDocument, section, instruction } = rewrite;
    if (!fullDocument?.trim() || !section?.trim() || !instruction?.trim()) {
      return jsonError("改写请求缺少 fullDocument / section / instruction", 400);
    }
    const total = fullDocument.length + section.length + instruction.length;
    if (total > MAX_REWRITE_CHARS) {
      return jsonError(`内容过长（${total} 字符，上限 ${MAX_REWRITE_CHARS}）`, 413);
    }
    systemPrompt = buildRewriteSystemPrompt(scenario);
    messages = [
      { role: "user", content: buildRewriteRequirement({ fullDocument, section, instruction }) },
    ];
  } else {
    if (!formData) {
      return new Response("Missing formData", { status: 400 });
    }
    if (followups.length > MAX_FOLLOWUPS) {
      return jsonError(`单次会话最多 ${MAX_FOLLOWUPS} 轮续写，请重新开始`, 400);
    }

    const missing = scenario.form.fields
      .filter((f) => f.required)
      .filter((f) => {
        if (f.showIf && formData[f.showIf.field] !== f.showIf.equals) return false;
        return !formData[f.id]?.trim();
      })
      .map((f) => f.label);
    if (missing.length > 0) {
      return jsonError(`缺少必填项：${missing.join("、")}`, 400);
    }

    const requirement = buildRequirement(scenario, formData);
    const totalChars =
      requirement.length +
      followups.reduce((s, f) => s + f.output.length + f.instruction.length, 0);
    if (totalChars > MAX_INPUT_CHARS) {
      return jsonError(`输入过长（${totalChars} 字符，上限 ${MAX_INPUT_CHARS}），请精简后再试`, 413);
    }

    systemPrompt = buildSystemPrompt(scenario);
    messages = [{ role: "user", content: requirement }];
    for (const fu of followups) {
      messages.push({ role: "assistant", content: fu.output });
      messages.push({ role: "user", content: fu.instruction });
    }
  }

  let client;
  try {
    client = getAnthropicClient();
  } catch (err) {
    return jsonError((err as Error).message, 503);
  }

  const userId = user?.id;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (type: string, data: unknown) => {
        controller.enqueue(encoder.encode(sseEvent(type, data)));
      };

      try {
        send("start", { scenario: scenario.id, kind });

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
        const tokenUsage = {
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          cacheReadTokens: usage.cache_read_input_tokens ?? 0,
          cacheCreateTokens: usage.cache_creation_input_tokens ?? 0,
        };

        let credits: { charged: number; remaining: number } | null = null;
        if (userId) {
          credits = chargeUsage(userId, scenario.id, kind, tokenUsage);
        }

        send("done", {
          inputTokens: tokenUsage.inputTokens,
          outputTokens: tokenUsage.outputTokens,
          cacheReadTokens: tokenUsage.cacheReadTokens,
          cacheCreateTokens: tokenUsage.cacheCreateTokens,
          stopReason: finalMsg.stop_reason,
          creditsCharged: credits?.charged ?? null,
          creditsRemaining: credits?.remaining ?? null,
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
