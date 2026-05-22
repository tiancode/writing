import { describe, expect, it } from "vitest";
import {
  splitSections,
  spliceSection,
  sectionLabel,
} from "../markdown-sections";

const doc = `引言段落，没有标题。

# 第一章

第一章内容。

## 1.1 小节

小节内容。

# 第二章

第二章内容。`;

describe("splitSections", () => {
  it("captures a leading preamble as a level-0 section", () => {
    const sections = splitSections(doc);
    expect(sections[0].level).toBe(0);
    expect(sections[0].content).toContain("引言段落");
  });

  it("starts a new section at every heading", () => {
    const sections = splitSections(doc);
    const headings = sections.filter((s) => s.level > 0).map((s) => s.heading);
    expect(headings).toEqual(["第一章", "1.1 小节", "第二章"]);
  });

  it("does not treat # inside a fenced code block as a heading", () => {
    const withCode = `# 标题

\`\`\`bash
# this is a shell comment, not a heading
echo hi
\`\`\`

正文`;
    const sections = splitSections(withCode);
    expect(sections.filter((s) => s.level > 0)).toHaveLength(1);
    expect(sections[0].content).toContain("# this is a shell comment");
  });

  it("drops a whitespace-only preamble", () => {
    const sections = splitSections("\n\n# 只有标题\n内容");
    expect(sections[0].heading).toBe("只有标题");
  });
});

describe("spliceSection", () => {
  it("replaces the targeted section and leaves others intact", () => {
    const sections = splitSections(doc);
    const target = sections.find((s) => s.heading === "1.1 小节")!;
    const next = spliceSection(doc, target.id, "## 1.1 小节\n\n改写后的小节内容。");
    expect(next).toContain("改写后的小节内容");
    expect(next).toContain("第一章内容");
    expect(next).toContain("第二章内容");
    // The original section's body is gone; same number of sections remain.
    const after = splitSections(next);
    expect(after.map((s) => s.heading)).toEqual(sections.map((s) => s.heading));
    const replaced = after.find((s) => s.heading === "1.1 小节")!;
    expect(replaced.content).toContain("改写后的小节内容");
    expect(replaced.content).not.toContain("\n小节内容。");
  });

  it("returns the document unchanged when id is unknown", () => {
    expect(spliceSection(doc, "999", "x")).toBe(doc);
  });

  it("round-trips: split then splice each section back yields same sections", () => {
    const sections = splitSections(doc);
    let acc = doc;
    for (const s of sections) {
      acc = spliceSection(acc, s.id, s.content);
    }
    expect(splitSections(acc).map((s) => s.heading)).toEqual(
      sections.map((s) => s.heading)
    );
  });
});

describe("sectionLabel", () => {
  it("uses the heading when present", () => {
    const [, first] = splitSections(doc);
    expect(sectionLabel(first)).toBe("第一章");
  });

  it("falls back to the first non-empty line for a preamble", () => {
    const [preamble] = splitSections(doc);
    expect(sectionLabel(preamble)).toContain("引言段落");
  });
});
