import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCENARIOS_ROOT = resolve(__dirname, "..", "..", "src", "scenarios");

export interface FormField {
  id: string;
  label: string;
  type: "text" | "textarea" | "select";
  options?: string[];
  placeholder?: string;
  required?: boolean;
  rows?: number;
  help?: string;
  showIf?: { field: string; equals: string };
}

export interface FormSchema {
  title: string;
  subtitle: string;
  icon: string;
  model: string;
  temperature: number;
  maxTokens: number;
  fields: FormField[];
}

export interface ScenarioSummary {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  description: string;
}

export interface Scenario extends ScenarioSummary {
  form: FormSchema;
  systemPrompt: string;
  style: string;
  templates: Record<string, string>;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf-8")) as T;
}

export async function listScenarios(): Promise<ScenarioSummary[]> {
  const entries = await readdir(SCENARIOS_ROOT);
  const result: ScenarioSummary[] = [];
  for (const id of entries) {
    const dir = join(SCENARIOS_ROOT, id);
    const s = await stat(dir);
    if (!s.isDirectory()) continue;
    if (!(await exists(join(dir, "meta.json")))) continue;
    if (!(await exists(join(dir, "form.json")))) continue;
    const meta = await readJson<{ description: string }>(join(dir, "meta.json"));
    const form = await readJson<FormSchema>(join(dir, "form.json"));
    result.push({
      id,
      title: form.title,
      subtitle: form.subtitle,
      icon: form.icon,
      description: meta.description,
    });
  }
  return result.sort((a, b) => a.id.localeCompare(b.id));
}

export async function loadScenario(id: string): Promise<Scenario> {
  const dir = join(SCENARIOS_ROOT, id);
  if (!(await exists(join(dir, "meta.json")))) {
    throw new Error(`Scenario "${id}" not found.`);
  }
  const meta = await readJson<{ description: string }>(join(dir, "meta.json"));
  const form = await readJson<FormSchema>(join(dir, "form.json"));
  const systemPrompt = await readFile(join(dir, "prompts/system.md"), "utf-8");
  const style = await readFile(join(dir, "style.md"), "utf-8").catch(() => "");

  const templates: Record<string, string> = {};
  const tplDir = join(dir, "templates");
  if (await exists(tplDir)) {
    const files = await readdir(tplDir);
    for (const f of files) {
      if (f.endsWith(".md")) {
        templates[f.replace(/\.md$/, "")] = await readFile(join(tplDir, f), "utf-8");
      }
    }
  }

  return {
    id,
    title: form.title,
    subtitle: form.subtitle,
    icon: form.icon,
    description: meta.description,
    form,
    systemPrompt,
    style,
    templates,
  };
}

export function shouldShowField(
  field: FormField,
  formData: Record<string, string>
): boolean {
  if (!field.showIf) return true;
  return formData[field.showIf.field] === field.showIf.equals;
}

export function buildRequirement(
  scenario: Scenario,
  formData: Record<string, string>
): string {
  const lines: string[] = [];
  for (const field of scenario.form.fields) {
    if (!shouldShowField(field, formData)) continue;
    const val = formData[field.id]?.trim();
    if (!val) continue;
    lines.push(`【${field.label}】\n${val}`);
  }
  return lines.join("\n\n");
}

// Intentionally duplicated from src/agent.ts's buildSystemAppend — the two
// packages are independent (no workspace), so a shared module isn't possible
// without converting to a monorepo. Keep this in sync if you change the CLI
// builder. Differences: Web appends the Web Mode Override; CLI appends an
// Output Location instruction for the Write tool.
export function buildSystemPrompt(scenario: Scenario): string {
  const templateBlock = Object.entries(scenario.templates)
    .map(([name, body]) => `### Template: ${name}.md\n\n${body}`)
    .join("\n\n---\n\n");

  return `${scenario.systemPrompt}

## Style Guide

${scenario.style}

## Available Templates

${templateBlock || "(no templates registered)"}

## CRITICAL — Web Mode Override

You are running in a **web UI streaming mode**, not a CLI with file tools.

- DO NOT mention or attempt to use any tools (Read, Write, Edit, etc.).
- DO NOT use phrases like "I will save this to..." or "I'll write the file...".
- Produce the COMPLETE document inline as Markdown directly in your response.
- Skip the "Phase 1 Plan" outline in user-facing output unless the requirement is
  ambiguous enough that you must ask clarifying questions instead of drafting.
- If you must ask clarifying questions, ask 1-3 sharp ones at the start, then
  STOP. Do not also draft a partial document — the user will resubmit with
  answers.
- After the document, append a short "✍️ 审校提示" section noting:
  - Any assumptions you made
  - Any \`<TBD: ...>\` placeholders the user must fill
`;
}

// Used by the section editor: rewrite ONE section of an existing document.
// Reuses the scenario's voice/style but swaps the Web Mode Override for a
// focused instruction to return only the revised fragment.
export function buildRewriteSystemPrompt(scenario: Scenario): string {
  return `${scenario.systemPrompt}

## Style Guide

${scenario.style}

## CRITICAL — Section Rewrite Mode

You are revising ONE section of an existing document in a web UI.

- The user gives you the full document for context, the exact section to
  rewrite, and an instruction describing the change.
- Return ONLY the rewritten section as Markdown. Nothing else.
- Preserve the section's heading and heading level (e.g. if it starts with
  \`## 标题\`, your output must start with \`## 标题\` or a revised title at the
  same level).
- Do NOT restate the rest of the document. Do NOT add commentary, preamble,
  or a "审校提示" block.
- Keep the section's language and overall voice consistent with the document.
`;
}

// User-turn content for a section rewrite request.
export function buildRewriteRequirement(input: {
  fullDocument: string;
  section: string;
  instruction: string;
}): string {
  return `这是文档全文（仅供参考，保持整体风格与上下文一致）：

<<<DOCUMENT
${input.fullDocument}
DOCUMENT

需要改写的片段：

<<<SECTION
${input.section}
SECTION

改写要求：${input.instruction}

只返回改写后的这个片段（Markdown），保留原有标题层级。不要复述全文，不要加任何说明文字。`;
}
