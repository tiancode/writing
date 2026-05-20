import Link from "next/link";
import { listScenarios } from "@/lib/scenarios";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const scenarios = await listScenarios();

  return (
    <div>
      <section className="text-center py-8">
        <h1 className="text-3xl font-bold tracking-tight mb-3">
          告诉 AI 你想写什么，剩下交给它
        </h1>
        <p className="text-[var(--color-muted)] max-w-2xl mx-auto leading-relaxed">
          不用写复杂提示词。选场景 → 填几个空 → 实时看 AI 帮你写完整篇文档。
        </p>
      </section>

      <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
        {scenarios.map((s) => (
          <Link
            key={s.id}
            href={`/${s.id}`}
            className="group bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-6 hover:border-[var(--color-accent)] hover:shadow-md transition-all"
          >
            <div className="text-3xl mb-3">{s.icon}</div>
            <h2 className="font-semibold text-lg mb-1 group-hover:text-[var(--color-accent)]">
              {s.title}
            </h2>
            <p className="text-sm text-[var(--color-muted)] leading-relaxed">
              {s.subtitle}
            </p>
          </Link>
        ))}
      </section>

      <section className="mt-12 bg-[var(--color-accent-soft)] border border-[var(--color-accent)]/20 rounded-lg p-6">
        <h3 className="font-semibold mb-2">怎么用？</h3>
        <ol className="text-sm text-[var(--color-ink)] space-y-1 list-decimal pl-5">
          <li>选一个场景</li>
          <li>按表单提示填关键信息（不会写就空着，AI 会用占位符标出来）</li>
          <li>点&ldquo;开始生成&rdquo;，看 AI 实时写出来</li>
          <li>满意就下载，不满意就改填写再来一次</li>
        </ol>
      </section>
    </div>
  );
}
