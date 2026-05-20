import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "写作助手 — AI 协作写作",
  description: "项目文档 · 投标文档 · 小说，向导式 AI 写作",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <header className="border-b border-[var(--color-border)] bg-white">
          <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              ✍️ 写作助手
            </Link>
            <nav className="text-sm text-[var(--color-muted)]">
              <Link href="/" className="hover:text-[var(--color-ink)]">首页</Link>
            </nav>
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
        <footer className="max-w-5xl mx-auto px-6 py-8 text-xs text-[var(--color-muted)] border-t border-[var(--color-border)] mt-12">
          由 Claude 提供能力 · 生成结果仅供参考，请自行审核
        </footer>
      </body>
    </html>
  );
}
