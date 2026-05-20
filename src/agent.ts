import { query } from "@anthropic-ai/claude-agent-sdk";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { Scenario } from "./scenarios/registry.js";

export interface RunOptions {
  scenario: Scenario;
  requirement: string;
  outputDir: string;
}

function buildSystemAppend(scenario: Scenario, outputDir: string): string {
  const templateBlock = Object.entries(scenario.templates)
    .map(([name, body]) => `### Template: ${name}.md\n\n${body}`)
    .join("\n\n---\n\n");

  return `${scenario.systemPrompt}

## Style Guide

${scenario.style}

## Available Templates

${templateBlock || "(no templates registered)"}

## Output Location

Save all generated documents to: ${outputDir}/
Pick a filename that reflects the document type and topic (e.g. \`prd-bookstore.md\`).
`;
}

function buildUserPrompt(requirement: string): string {
  return `User requirement:
${requirement}

Follow the three-phase flow:

1. **Plan** — choose the right template, produce a section-level outline with word-count estimates, and flag any critical missing info as 1-3 sharp questions if needed.
2. **Draft** — write each section based on the outline. Use the Write tool to save the result.
3. **Review** — re-read your draft, fix issues with Edit, and produce a short "Review Notes" summary covering: assumptions made, items the user should verify, suggested next steps.
`;
}

export async function runAgent({ scenario, requirement, outputDir }: RunOptions): Promise<void> {
  const absOutput = resolve(outputDir);
  await mkdir(absOutput, { recursive: true });

  console.log(`\n[scenario] ${scenario.id} — ${scenario.description}`);
  console.log(`[output]   ${absOutput}\n`);

  const stream = query({
    prompt: buildUserPrompt(requirement),
    options: {
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append: buildSystemAppend(scenario, absOutput),
      },
      allowedTools: ["Read", "Write", "Edit", "Glob", "Grep"],
      cwd: process.cwd(),
      permissionMode: "acceptEdits",
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
