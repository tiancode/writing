import { describe, expect, it } from "vitest";
import { buildSystemAppend, buildUserPrompt } from "../agent.js";
import type { Scenario } from "../scenarios/registry.js";

const fixture: Scenario = {
  id: "test",
  description: "test scenario",
  dir: "/fake",
  systemPrompt: "BASE SYSTEM PROMPT",
  style: "STYLE RULES",
  templates: {
    prd: "PRD TEMPLATE BODY",
    design: "DESIGN TEMPLATE BODY",
  },
};

describe("buildSystemAppend", () => {
  it("composes system prompt + style + templates + output instruction", () => {
    const out = buildSystemAppend(fixture, "/tmp/out");
    expect(out).toMatchInlineSnapshot(`
      "BASE SYSTEM PROMPT

      ## Style Guide

      STYLE RULES

      ## Available Templates

      ### Template: prd.md

      PRD TEMPLATE BODY

      ---

      ### Template: design.md

      DESIGN TEMPLATE BODY

      ## Output Location

      Save all generated documents to: /tmp/out/
      Pick a filename that reflects the document type and topic (e.g. \`prd-bookstore.md\`).
      "
    `);
  });

  it("handles scenarios with no templates", () => {
    const out = buildSystemAppend({ ...fixture, templates: {} }, "/tmp/out");
    expect(out).toContain("(no templates registered)");
  });
});

describe("buildUserPrompt", () => {
  it("includes the three-phase flow instructions", () => {
    const out = buildUserPrompt("write a PRD for a bookstore");
    expect(out).toContain("write a PRD for a bookstore");
    expect(out).toContain("Plan");
    expect(out).toContain("Draft");
    expect(out).toContain("Review");
  });
});
