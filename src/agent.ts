import { query } from "@anthropic-ai/claude-agent-sdk";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { Scenario } from "./scenarios/registry.js";
import { createPathGuard } from "./sandbox.js";

export interface RunOptions {
  scenario: Scenario;
  requirement: string;
  outputDir: string;
  inputPaths?: string[];
}

// Intentionally duplicated in web/lib/scenarios.ts as buildSystemPrompt — the
// two packages don't share a workspace, so changes here should be mirrored
// there. CLI variant ends with an Output Location instruction; Web variant
// ends with the Web Mode Override.
export function buildSystemAppend(
  scenario: Scenario,
  outputDir: string,
  inputPaths: string[] = []
): string {
  const templateBlock = Object.entries(scenario.templates)
    .map(([name, body]) => `### Template: ${name}.md\n\n${body}`)
    .join("\n\n---\n\n");

  const inputBlock =
    inputPaths.length > 0
      ? `\n## Reference Materials (read-only)

The user has provided these external paths. You may Read / Glob / Grep them
for context, but you cannot Write or Edit anything there:

${inputPaths.map((p) => `- ${p}`).join("\n")}
`
      : "";

  return `${scenario.systemPrompt}

## Style Guide

${scenario.style}

## Available Templates

${templateBlock || "(no templates registered)"}
${inputBlock}
## Output Location

Save all generated documents to: ${outputDir}/
Pick a filename that reflects the document type and topic (e.g. \`prd-bookstore.md\`).
Writes outside this directory are blocked by the runtime sandbox.
`;
}

export function buildUserPrompt(requirement: string): string {
  return `User requirement:
${requirement}

Follow the three-phase flow:

1. **Plan** — choose the right template, produce a section-level outline with word-count estimates, and flag any critical missing info as 1-3 sharp questions if needed.
2. **Draft** — write each section based on the outline. Use the Write tool to save the result.
3. **Review** — re-read your draft, fix issues with Edit, and produce a short "Review Notes" summary covering: assumptions made, items the user should verify, suggested next steps.
`;
}

export async function runAgent({
  scenario,
  requirement,
  outputDir,
  inputPaths = [],
}: RunOptions): Promise<void> {
  const absOutput = resolve(outputDir);
  await mkdir(absOutput, { recursive: true });
  const absInputs = inputPaths.map((p) => resolve(p));

  console.log(`\n[scenario] ${scenario.id} — ${scenario.description}`);
  console.log(`[output]   ${absOutput}`);
  if (absInputs.length > 0) {
    console.log(`[inputs]   ${absInputs.join(", ")} (read-only)`);
  }
  console.log();

  const modelOverride = process.env.ANTHROPIC_MODEL;
  if (modelOverride) {
    console.log(`[model]    ${modelOverride} (from ANTHROPIC_MODEL)\n`);
  }

  const pathGuard = createPathGuard({
    outputDir: absOutput,
    inputPaths: absInputs,
    onDeny: (tool, path, reason) => {
      process.stdout.write(`\n[sandbox-deny] ${tool} ${path}\n  ${reason}\n`);
    },
  });

  const stream = query({
    prompt: buildUserPrompt(requirement),
    options: {
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append: buildSystemAppend(scenario, absOutput, absInputs),
      },
      allowedTools: ["Read", "Write", "Edit", "Glob", "Grep"],
      cwd: absOutput,
      permissionMode: "acceptEdits",
      hooks: {
        PreToolUse: [{ hooks: [pathGuard] }],
      },
      ...(modelOverride ? { model: modelOverride } : {}),
    },
  });

  for await (const msg of stream) {
    if (msg.type === "assistant") {
      for (const block of msg.message.content) {
        if (block.type === "text") {
          process.stdout.write(block.text);
        } else if (block.type === "tool_use") {
          process.stdout.write(`\n[tool] ${block.name}\n`);
        }
      }
    } else if (msg.type === "result") {
      process.stdout.write("\n\n--- Done ---\n");
      if (msg.subtype === "success" && typeof msg.total_cost_usd === "number") {
        console.log(`Cost: $${msg.total_cost_usd.toFixed(4)}`);
      }
    }
  }
}
