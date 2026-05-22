"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, type AuthUser } from "./auth-context";

export default function AuthForm() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { setUser } = useAuth();
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "操作失败");
      setUser(data.user as AuthUser);
      router.push("/projects");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-8">
      <div className="flex border border-[var(--color-border)] rounded-md overflow-hidden mb-6">
        <button
          type="button"
          onClick={() => setMode("login")}
          className={`flex-1 py-2 text-sm font-medium ${
            mode === "login"
              ? "bg-[var(--color-accent)] text-white"
              : "bg-white hover:bg-stone-50"
          }`}
        >
          登录
        </button>
        <button
          type="button"
          onClick={() => setMode("register")}
          className={`flex-1 py-2 text-sm font-medium ${
            mode === "register"
              ? "bg-[var(--color-accent)] text-white"
              : "bg-white hover:bg-stone-50"
          }`}
        >
          注册
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-1.5">
            邮箱
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium mb-1.5">
            密码{mode === "register" && "（至少 8 位）"}
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full bg-[var(--color-accent)] text-white font-medium py-2.5 rounded-md hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "处理中…" : mode === "login" ? "登录" : "注册并登录"}
        </button>
      </form>

      <p className="text-xs text-[var(--color-muted)] text-center mt-4">
        注册即获得初始额度，可立即开始生成与保存文档
      </p>
    </div>
  );
}
