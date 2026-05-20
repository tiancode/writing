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

interface GenerateRequest {
  scenarioId: string;
  formData: Record<string, string>;
}

function sseEvent(type: string, data: unknown): string {
  return `data: ${JSON.stringify({ type, ...(typeof data === "object" && data !== null ? data : { content: data }) })}\n\n`;
}

export async function POST(req: NextRequest) {
  let body: GenerateRequest;
  try {
    body = (await req.json()) as GenerateRequest;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const { scenarioId, formData } = body;
  if (!scenarioId || !formData) {
    return new Response("Missing scenarioId or formData", { status: 400 });
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
  const systemPrompt = buildSystemPrompt(scenario);

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
          model: scenario.form.model,
          max_tokens: scenario.form.maxTokens,
          temperature: scenario.form.temperature,
          system: systemPrompt,
          messages: [{ role: "user", content: requirement }],
        });

        apiStream.on("text", (text) => {
          send("text", text);
        });

        const finalMsg = await apiStream.finalMessage();
        const usage = finalMsg.usage;
        send("done", {
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
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
