"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth-context";

interface DocItem {
  id: string;
  title: string;
  scenarioId: string;
  updatedAt: number;
}

export default function ProjectsPage() {
  const { user, loading } = useAuth();
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setFetching(true);
    try {
      const res = await fetch("/api/documents", { cache: "no-store" });
      if (res.status === 401) {
        setDocs([]);
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "加载失败");
      setDocs(
        data.documents.map((d: Record<string, unknown>) => ({
          id: d.id,
          title: d.title,
          scenarioId: d.scenarioId,
          updatedAt: d.updatedAt,
        }))
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && user) load();
    else if (!loading && !user) setFetching(false);
  }, [loading, user, load]);

  async function handleDelete(id: string) {
    if (!confirm("确定删除这篇文档？")) return;
    const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    if (res.ok) setDocs((prev) => prev.filter((d) => d.id !== id));
  }

  if (!loading && !user) {
    return (
      <div className="text-center py-16">
        <p className="text-[var(--color-muted)] mb-4">登录后查看你保存的文档</p>
        <Link
          href="/login"
          className="px-4 py-2 bg-[var(--color-accent)] text-white rounded-md"
        >
          去登录
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">我的文档</h1>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {fetching ? (
        <p className="text-sm text-[var(--color-muted)]">加载中…</p>
      ) : docs.length === 0 ? (
        <div className="text-center py-16 text-[var(--color-muted)]">
          <p className="mb-4">还没有保存的文档</p>
          <Link href="/" className="text-[var(--color-accent)] underline">
            去生成第一篇
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {docs.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center justify-between border border-[var(--color-border)] rounded-lg px-4 py-3 bg-white hover:border-[var(--color-accent)] transition-colors"
            >
              <Link href={`/documents/${doc.id}`} className="flex-1 min-w-0">
                <div className="font-medium truncate">{doc.title}</div>
                <div className="text-xs text-[var(--color-muted)] mt-0.5">
                  {doc.scenarioId} ·{" "}
                  {new Date(doc.updatedAt).toLocaleString("zh-CN")}
                </div>
              </Link>
              <button
                onClick={() => handleDelete(doc.id)}
                className="ml-4 text-sm text-red-600 hover:underline shrink-0"
              >
                删除
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
