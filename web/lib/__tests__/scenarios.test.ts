import { describe, expect, it } from "vitest";
import {
  buildRequirement,
  buildSystemPrompt,
  shouldShowField,
  type Scenario,
} from "../scenarios";

const fixture: Scenario = {
  id: "test",
  title: "Test",
  subtitle: "test",
  icon: "🧪",
  description: "test scenario",
  form: {
    title: "Test",
    subtitle: "test",
    icon: "🧪",
    model: "claude-sonnet-4-6",
    temperature: 0.5,
    maxTokens: 16000,
    fields: [
      { id: "name", label: "名称", type: "text", required: true },
      { id: "desc", label: "描述", type: "textarea", required: false },
      {
        id: "mode",
        label: "模式",
        type: "select",
        options: ["A", "B"],
        required: true,
      },
      {
        id: "extra",
        label: "附加",
        type: "text",
        required: false,
        showIf: { field: "mode", equals: "A" },
      },
    ],
  },
  systemPrompt: "BASE SYSTEM PROMPT",
  style: "STYLE RULES",
  templates: { tpl: "TEMPLATE BODY" },
};

describe("buildSystemPrompt", () => {
  it("includes the Web Mode Override block forbidding tool calls", () => {
    const out = buildSystemPrompt(fixture);
    expect(out).toContain("CRITICAL — Web Mode Override");
    expect(out).toContain("DO NOT mention or attempt to use any tools");
    expect(out).toContain("inline as Markdown");
    expect(out).toContain("审校提示");
  });

  it("includes base system prompt, style, and templates", () => {
    const out = buildSystemPrompt(fixture);
    expect(out).toContain("BASE SYSTEM PROMPT");
    expect(out).toContain("STYLE RULES");
    expect(out).toContain("### Template: tpl.md");
    expect(out).toContain("TEMPLATE BODY");
  });
});

describe("buildRequirement", () => {
  it("formats filled fields as labeled blocks", () => {
    const out = buildRequirement(fixture, {
      name: "alice",
      desc: "a person",
      mode: "B",
    });
    expect(out).toContain("【名称】\nalice");
    expect(out).toContain("【描述】\na person");
    expect(out).toContain("【模式】\nB");
  });

  it("skips fields hidden by showIf", () => {
    const out = buildRequirement(fixture, {
      name: "alice",
      mode: "B",
      extra: "should not appear",
    });
    expect(out).not.toContain("should not appear");
    expect(out).not.toContain("【附加】");
  });

  it("includes showIf field when condition matches", () => {
    const out = buildRequirement(fixture, {
      name: "alice",
      mode: "A",
      extra: "shown",
    });
    expect(out).toContain("【附加】\nshown");
  });
});

describe("shouldShowField", () => {
  it("returns true when no showIf condition", () => {
    expect(
      shouldShowField(
        { id: "x", label: "x", type: "text" },
        { other: "y" }
      )
    ).toBe(true);
  });

  it("respects showIf equality", () => {
    const field = {
      id: "x",
      label: "x",
      type: "text" as const,
      showIf: { field: "mode", equals: "A" },
    };
    expect(shouldShowField(field, { mode: "A" })).toBe(true);
    expect(shouldShowField(field, { mode: "B" })).toBe(false);
    expect(shouldShowField(field, {})).toBe(false);
  });
});
