"use client";

import { useMemo, useRef, useState } from "react";
import MarkdownView from "./MarkdownView";
import {
  splitSections,
  spliceSection,
  sectionLabel,
} from "@/lib/markdown-sections";
import { streamGenerate } from "@/lib/sse-client";
import { useAuth } from "./auth-context";

interface Props {
  content: string;
  scenarioId: string;
  onContentChange: (next: string) => void;
}

const PRESETS = [
  { label: "更正式", instruction: "把这一段改写得更正式、更书面化，但不改变核心内容。" },
  { label: "更口语", instruction: "把这一段改写得更口语、更自然易读。" },
  { label: "扩充细节", instruction: "在保持结构的前提下，扩充这一段，补充具体的例子、数据或细节。" },
  { label: "精简", instruction: "在不丢失关键信息的前提下，把这一段压缩得更精炼。" },
];

export default function SectionEditor({
  content,
  scenarioId,
  onContentChange,
}: Props) {
  const sections = useMemo(() => splitSections(content), [content]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const { refresh } = useAuth();

  function openEditor(id: string) {
    setEditingId(id);
    setInstruction("");
    setPreview("");
    setError("");
  }

  function closeEditor() {
    abortRef.current?.abort();
    setEditingId(null);
    setInstruction("");
    setPreview("");
    setError("");
    setBusy(false);
  }

  async function handleRewrite(sectionId: string, sectionContent: string) {
    const trimmed = instruction.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError("");
    setPreview("");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const { text } = await streamGenerate(
        {
          scenarioId,
          rewrite: {
            fullDocument: content,
            section: sectionContent,
            instruction: trimmed,
          },
        },
        { signal: controller.signal, onText: setPreview }
      );
      const next = spliceSection(content, sectionId, text);
      onContentChange(next);
      refresh();
      closeEditor();
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setBusy(false);
        return;
      }
      setError((err as Error).message);
      setBusy(false);
    } finally {
      abortRef.current = null;
    }
  }

  return (
    <div className="space-y-1">
      {sections.map((section) => {
        const isEditing = editingId === section.id;
        return (
          <div
            key={section.id}
            className={`group relative rounded-md transition-colors ${
              isEditing
                ? "bg-[var(--color-accent-soft)]/40 ring-1 ring-[var(--color-accent)]/30"
                : "hover:bg-stone-50"
            }`}
          >
            <div className="px-2 py-1">
              <div className="md-view">
                <MarkdownView source={section.content} />
              </div>
            </div>

            {!isEditing && (
              <button
                type="button"
                onClick={() => openEditor(section.id)}
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity text-xs px-2 py-1 bg-white border border-[var(--color-border)] rounded shadow-sm hover:border-[var(--color-accent)]"
                title={`改写「${sectionLabel(section)}」`}
              >
                改写
              </button>
            )}

            {isEditing && (
              <div className="px-3 pb-3 pt-1 space-y-2 border-t border-[var(--color-border)] mt-1">
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      disabled={busy}
                      onClick={() => setInstruction(p.instruction)}
                      className="text-xs px-2 py-1 border border-[var(--color-border)] rounded-full hover:border-[var(--color-accent)] disabled:opacity-50"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <textarea
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder="描述想怎么改这一段，例如：补一个真实案例、语气更坚定…"
                  rows={2}
                  disabled={busy}
                  className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] resize-y disabled:opacity-50"
                />

                {busy && preview && (
                  <div className="border border-dashed border-[var(--color-accent)]/40 rounded p-2 bg-white">
                    <p className="text-xs text-[var(--color-muted)] mb-1">
                      改写预览（生成中…）
                    </p>
                    <div className="md-view text-sm">
                      <MarkdownView source={preview} />
                    </div>
                  </div>
                )}

                {error && <p className="text-xs text-red-600">{error}</p>}

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy || !instruction.trim()}
                    onClick={() => handleRewrite(section.id, section.content)}
                    className="text-sm px-3 py-1.5 bg-[var(--color-accent)] text-white rounded-md hover:opacity-90 disabled:opacity-40"
                  >
                    {busy ? "改写中…" : "应用改写"}
                  </button>
                  <button
                    type="button"
                    onClick={closeEditor}
                    className="text-sm px-3 py-1.5 border border-[var(--color-border)] rounded-md hover:bg-stone-50"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
