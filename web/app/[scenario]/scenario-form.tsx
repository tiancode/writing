"use client";

import { useMemo, useRef, useState } from "react";
import MarkdownView from "@/components/MarkdownView";
import type { FormField } from "@/lib/scenarios";

interface Props {
  scenarioId: string;
  fields: FormField[];
}

type Status = "idle" | "generating" | "done" | "error";

function shouldShow(field: FormField, data: Record<string, string>): boolean {
  if (!field.showIf) return true;
  return data[field.showIf.field] === field.showIf.equals;
}

export default function ScenarioForm({ scenarioId, fields }: Props) {
  const [formData, setFormData] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const f of fields) {
      if (f.type === "select" && f.options && f.options.length > 0) {
        initial[f.id] = f.options[0];
      }
    }
    return initial;
  });
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [usage, setUsage] = useState<{ input: number; output: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  const visibleFields = useMemo(
    () => fields.filter((f) => shouldShow(f, formData)),
    [fields, formData]
  );

  function updateField(id: string, value: string) {
    setFormData((prev) => ({ ...prev, [id]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setOutput("");
    setErrorMsg("");
    setUsage(null);
    setStatus("generating");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId, formData }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        try {
          const json = JSON.parse(text);
          throw new Error(json.error || text);
        } catch {
          throw new Error(text || `HTTP ${res.status}`);
        }
      }

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const eventChunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);

          if (!eventChunk.startsWith("data: ")) continue;
          const payload = eventChunk.slice(6);
          try {
            const evt = JSON.parse(payload);
            if (evt.type === "text") {
              setOutput((prev) => prev + evt.content);
              requestAnimationFrame(() => {
                outputRef.current?.scrollTo({
                  top: outputRef.current.scrollHeight,
                  behavior: "smooth",
                });
              });
            } else if (evt.type === "done") {
              setUsage({ input: evt.inputTokens, output: evt.outputTokens });
              setStatus("done");
            } else if (evt.type === "error") {
              throw new Error(evt.message);
            }
          } catch (parseErr) {
            console.warn("Failed to parse SSE event:", payload, parseErr);
          }
        }
      }

      if (status !== "done") setStatus("done");
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setStatus("idle");
      } else {
        setErrorMsg((err as Error).message);
        setStatus("error");
      }
    } finally {
      abortRef.current = null;
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  function handleDownload() {
    const blob = new Blob([output], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    a.href = url;
    a.download = `${scenarioId}-${ts}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(output);
  }

  const busy = status === "generating";

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {/* Left: Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        {visibleFields.map((field) => (
          <div key={field.id}>
            <label
              htmlFor={field.id}
              className="block text-sm font-medium mb-1.5"
            >
              {field.label}
              {field.required && (
                <span className="text-red-500 ml-1">*</span>
              )}
            </label>

            {field.type === "text" && (
              <input
                id={field.id}
                type="text"
                value={formData[field.id] ?? ""}
                onChange={(e) => updateField(field.id, e.target.value)}
                placeholder={field.placeholder}
                disabled={busy}
                className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent disabled:opacity-50"
              />
            )}

            {field.type === "textarea" && (
              <textarea
                id={field.id}
                value={formData[field.id] ?? ""}
                onChange={(e) => updateField(field.id, e.target.value)}
                placeholder={field.placeholder}
                rows={field.rows ?? 3}
                disabled={busy}
                className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent disabled:opacity-50 resize-y"
              />
            )}

            {field.type === "select" && (
              <select
                id={field.id}
                value={formData[field.id] ?? ""}
                onChange={(e) => updateField(field.id, e.target.value)}
                disabled={busy}
                className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent disabled:opacity-50"
              >
                {field.options?.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            )}

            {field.help && (
              <p className="text-xs text-[var(--color-muted)] mt-1">
                {field.help}
              </p>
            )}
          </div>
        ))}

        <div className="flex gap-3 pt-2">
          {!busy ? (
            <button
              type="submit"
              className="flex-1 bg-[var(--color-accent)] text-white font-medium py-2.5 rounded-md hover:opacity-90 transition-opacity"
            >
              开始生成
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStop}
              className="flex-1 bg-red-600 text-white font-medium py-2.5 rounded-md hover:opacity-90 transition-opacity"
            >
              停止
            </button>
          )}
        </div>
      </form>

      {/* Right: Output */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">生成结果</h2>
          {status === "done" && (
            <div className="flex gap-2 text-sm">
              <button
                onClick={handleCopy}
                className="px-3 py-1 border border-[var(--color-border)] rounded hover:bg-stone-50"
              >
                复制
              </button>
              <button
                onClick={handleDownload}
                className="px-3 py-1 bg-[var(--color-ink)] text-white rounded hover:opacity-90"
              >
                下载 .md
              </button>
            </div>
          )}
        </div>

        <div
          ref={outputRef}
          className="bg-white border border-[var(--color-border)] rounded-lg p-5 min-h-[500px] max-h-[70vh] overflow-y-auto"
        >
          {status === "idle" && !output && (
            <p className="text-[var(--color-muted)] text-sm text-center pt-20">
              填好表单点&ldquo;开始生成&rdquo;，结果会实时显示在这里
            </p>
          )}
          {status === "error" && (
            <div className="text-red-600 text-sm">
              <p className="font-medium mb-1">出错了</p>
              <p>{errorMsg}</p>
            </div>
          )}
          {output && (
            <div className="md-view">
              <MarkdownView source={output} />
              {busy && (
                <span className="inline-block w-2 h-4 bg-[var(--color-accent)] animate-pulse align-middle ml-0.5" />
              )}
            </div>
          )}
        </div>

        {usage && (
          <div className="text-xs text-[var(--color-muted)] text-right">
            输入 {usage.input} tokens · 输出 {usage.output} tokens
          </div>
        )}
      </div>
    </div>
  );
}
