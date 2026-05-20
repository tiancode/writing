import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCENARIOS_ROOT = __dirname;

export interface ScenarioMeta {
  id: string;
  description: string;
}

export interface Scenario extends ScenarioMeta {
  dir: string;
  systemPrompt: string;
  style: string;
  templates: Record<string, string>;
}

async function isScenarioDir(dir: string): Promise<boolean> {
  try {
    const s = await stat(join(dir, "meta.json"));
    return s.isFile();
  } catch {
    return false;
  }
}

export async function listScenarios(): Promise<ScenarioMeta[]> {
  const entries = await readdir(SCENARIOS_ROOT);
  const result: ScenarioMeta[] = [];
  for (const id of entries) {
    const dir = join(SCENARIOS_ROOT, id);
    const s = await stat(dir);
    if (!s.isDirectory()) continue;
    if (!(await isScenarioDir(dir))) continue;
    const meta = JSON.parse(await readFile(join(dir, "meta.json"), "utf-8"));
    result.push({ id, description: meta.description });
  }
  return result;
}

export async function loadScenario(id: string): Promise<Scenario> {
  const dir = join(SCENARIOS_ROOT, id);
  if (!(await isScenarioDir(dir))) {
    throw new Error(`Scenario "${id}" not found. Run "list" to see options.`);
  }
  const meta = JSON.parse(await readFile(join(dir, "meta.json"), "utf-8"));
  const systemPrompt = await readFile(join(dir, "prompts/system.md"), "utf-8");
  const style = await readFile(join(dir, "style.md"), "utf-8").catch(() => "");

  const templates: Record<string, string> = {};
  const tplDir = join(dir, "templates");
  try {
    const files = await readdir(tplDir);
    for (const f of files) {
      if (f.endsWith(".md")) {
        templates[f.replace(/\.md$/, "")] = await readFile(join(tplDir, f), "utf-8");
      }
    }
  } catch {
    // no templates dir is fine
  }

  return { id, description: meta.description, dir, systemPrompt, style, templates };
}
