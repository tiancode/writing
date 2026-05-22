"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import SectionEditor from "./SectionEditor";
import { useAuth } from "./auth-context";

interface Props {
  documentId: string;
}

type Load = "loading" | "ready" | "notfound" | "unauthorized" | "error";

export default function DocumentEditor({ documentId }: Props) {
  const { loading: authLoading, user } = useAuth();
  const [load, setLoad] = useState<Load>("loading");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [scenarioId, setScenarioId] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState("");
  const lastSaved = useRef<{ title: string; content: string }>({
    title: "",
    content: "",
  });

  const fetchDoc = useCallback(async () => {
    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        cache: "no-store",
      });
      if (res.status === 401) return setLoad("unauthorized");
      if (res.status === 404) return setLoad("notfound");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "加载失败");
      const doc = data.document;
      setTitle(doc.title);
      setContent(doc.content);
      setScenarioId(doc.scenarioId);
      lastSaved.current = { title: doc.title, content: doc.content };
      setLoad("ready");
    } catch (err) {
      setError((err as Error).message);
      setLoad("error");
    }
  }, [documentId]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return setLoad("unauthorized");
    fetchDoc();
  }, [authLoading, user, fetchDoc]);

  function updateContent(next: string) {
    setContent(next);
    setDirty(next !== lastSaved.current.content || title !== lastSaved.current.title);
  }

  function updateTitle(next: string) {
    setTitle(next);
    setDirty(content !== lastSaved.current.content || next !== lastSaved.current.title);
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败");
      lastSaved.current = { title, content };
      setDirty(false);
      setSavedAt(Date.now());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (load === "loading")
    return <p className="text-sm text-[var(--color-muted)]">加载中…</p>;
  if (load === "unauthorized")
    return (
      <div className="text-center py-16 text-[var(--color-muted)]">
        <p className="mb-4">请先登录</p>
        <Link href="/login" className="text-[var(--color-accent)] underline">
          去登录
        </Link>
      </div>
    );
  if (load === "notfound")
    return (
      <div className="text-center py-16 text-[var(--color-muted)]">
        <p className="mb-4">文档不存在或无权访问</p>
        <Link href="/projects" className="text-[var(--color-accent)] underline">
          返回我的文档
        </Link>
      </div>
    );
  if (load === "error")
    return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/projects"
          className="text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]"
        >
          ← 返回我的文档
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <input
          value={title}
          onChange={(e) => updateTitle(e.target.value)}
          className="flex-1 text-xl font-bold px-3 py-2 border border-transparent rounded-md hover:border-[var(--color-border)] focus:border-[var(--color-accent)] focus:outline-none bg-transparent"
        />
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="px-4 py-2 bg-[var(--color-accent)] text-white text-sm font-medium rounded-md hover:opacity-90 disabled:opacity-40 shrink-0"
        >
          {saving ? "保存中…" : dirty ? "保存修改" : "已保存"}
        </button>
      </div>

      <div className="flex items-center gap-3 text-xs text-[var(--color-muted)] mb-4">
        <span>{scenarioId}</span>
        {savedAt && <span>· 已保存 {new Date(savedAt).toLocaleTimeString("zh-CN")}</span>}
        {dirty && <span className="text-amber-600">· 有未保存修改</span>}
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <div className="bg-white border border-[var(--color-border)] rounded-lg p-3">
        <SectionEditor
          content={content}
          scenarioId={scenarioId}
          onContentChange={updateContent}
        />
      </div>

      <p className="text-xs text-[var(--color-muted)] mt-3">
        把鼠标移到段落上点&ldquo;改写&rdquo;可单独重写该段；改完记得点&ldquo;保存修改&rdquo;。
      </p>
    </div>
  );
}
