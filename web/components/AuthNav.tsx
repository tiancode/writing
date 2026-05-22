"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "./auth-context";

export default function AuthNav() {
  const { user, loading, setUser } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.push("/");
    router.refresh();
  }

  if (loading) {
    return <span className="text-sm text-[var(--color-muted)]">…</span>;
  }

  if (!user) {
    return (
      <div className="flex items-center gap-4 text-sm">
        <Link href="/" className="hover:text-[var(--color-ink)]">
          首页
        </Link>
        <Link
          href="/login"
          className="px-3 py-1.5 bg-[var(--color-accent)] text-white rounded-md hover:opacity-90"
        >
          登录 / 注册
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 text-sm">
      <Link href="/" className="hover:text-[var(--color-ink)]">
        首页
      </Link>
      <Link href="/projects" className="hover:text-[var(--color-ink)]">
        我的文档
      </Link>
      <span
        className="text-[var(--color-muted)]"
        title="剩余额度"
      >
        额度 {user.credits.toLocaleString()}
      </span>
      <span className="text-[var(--color-muted)] hidden sm:inline">
        {user.email}
      </span>
      <button
        onClick={handleLogout}
        className="px-3 py-1.5 border border-[var(--color-border)] rounded-md hover:bg-stone-50"
      >
        退出
      </button>
    </div>
  );
}
