import { notFound } from "next/navigation";
import Link from "next/link";
import { loadScenario } from "@/lib/scenarios";
import ScenarioForm from "./scenario-form";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ scenario: string }>;
}

export default async function ScenarioPage({ params }: Props) {
  const { scenario: scenarioId } = await params;

  let scenario;
  try {
    scenario = await loadScenario(scenarioId);
  } catch {
    notFound();
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/"
          className="text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]"
        >
          ← 返回场景选择
        </Link>
      </div>

      <header className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-3xl">{scenario.icon}</span>
          <h1 className="text-2xl font-bold">{scenario.title}</h1>
        </div>
        <p className="text-[var(--color-muted)]">{scenario.subtitle}</p>
      </header>

      <ScenarioForm
        scenarioId={scenario.id}
        fields={scenario.form.fields}
      />
    </div>
  );
}
