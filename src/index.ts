#!/usr/bin/env node
import "dotenv/config";
import { parseArgs } from "node:util";
import { runAgent } from "./agent.js";
import { listScenarios, loadScenario } from "./scenarios/registry.js";

function printUsage() {
  console.log(`Usage:
  writing-agent list
  writing-agent <scenario-id> "<requirement>" [--output <dir>] [--input <path>]...

Options:
  --output, -o <dir>     Output directory (default: ./output). The agent's
                         writes are sandboxed to this directory.
  --input,  -i <path>    Extra path the agent may Read / Glob / Grep
                         (but not write). Repeatable. Use for tender docs,
                         reference materials, etc.

Examples:
  writing-agent list
  writing-agent project-doc "为一个二手书交易小程序写一份 PRD"
  writing-agent project-doc "设计文档：消息推送服务" --output ./drafts
  writing-agent bid-doc "针对招标文件，生成技术应答" \\
    --input ./tender.md --input ./company-cases/
`);
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") {
    printUsage();
    return;
  }

  if (argv[0] === "list") {
    const scenarios = await listScenarios();
    console.log("Available scenarios:\n");
    for (const s of scenarios) {
      console.log(`  ${s.id.padEnd(16)} ${s.description}`);
    }
    return;
  }

  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      output: { type: "string", short: "o" },
      input: { type: "string", short: "i", multiple: true },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  if (values.help) {
    printUsage();
    return;
  }

  const [scenarioId, requirement, ...extra] = positionals;
  if (!scenarioId || !requirement) {
    console.error("Missing scenario or requirement.\n");
    printUsage();
    process.exit(1);
  }
  if (extra.length > 0) {
    console.error(`Unexpected positional arguments: ${extra.join(" ")}\n`);
    printUsage();
    process.exit(1);
  }

  const outputDir = values.output ?? "./output";
  const inputPaths = values.input ?? [];
  const scenario = await loadScenario(scenarioId);
  await runAgent({ scenario, requirement, outputDir, inputPaths });
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
