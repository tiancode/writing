#!/usr/bin/env node
import { runAgent } from "./agent.js";
import { listScenarios, loadScenario } from "./scenarios/registry.js";

function printUsage() {
  console.log(`Usage:
  writing-agent list
  writing-agent <scenario-id> "<requirement>" [--output <dir>]

Examples:
  writing-agent list
  writing-agent project-doc "为一个二手书交易小程序写一份 PRD"
  writing-agent project-doc "设计文档：消息推送服务" --output ./drafts
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "-h" || args[0] === "--help") {
    printUsage();
    return;
  }

  if (args[0] === "list") {
    const scenarios = await listScenarios();
    console.log("Available scenarios:\n");
    for (const s of scenarios) {
      console.log(`  ${s.id.padEnd(16)} ${s.description}`);
    }
    return;
  }

  const scenarioId = args[0];
  const requirement = args[1];
  const outputIdx = args.indexOf("--output");
  const outputDir = outputIdx >= 0 ? args[outputIdx + 1] : "./output";

  if (!requirement) {
    console.error("Missing requirement.\n");
    printUsage();
    process.exit(1);
  }

  const scenario = await loadScenario(scenarioId);
  await runAgent({ scenario, requirement, outputDir });
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
