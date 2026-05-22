// Pure helpers for splitting a Markdown document into editable sections and
// splicing a rewritten section back in. Used by the section editor (web UI).
//
// A "section" is a heading line (#..######) plus everything up to the next
// heading of the same or shallower depth is NOT how we split — we keep it
// simple and robust: each heading starts a new section that runs until the
// next heading of ANY level. Content before the first heading becomes a
// leading "preamble" section with no heading.

export interface Section {
  /** Stable id derived from index — used as React key and for splice. */
  id: string;
  /** Heading depth 1-6, or 0 for the leading preamble with no heading. */
  level: number;
  /** Heading text without the leading #s, or "" for the preamble. */
  heading: string;
  /** The full raw markdown of this section, including the heading line. */
  content: string;
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;

/**
 * Split markdown into sections at every ATX heading. Fenced code blocks are
 * respected — a "#" inside ``` is not treated as a heading.
 */
export function splitSections(markdown: string): Section[] {
  const lines = markdown.split("\n");
  const sections: Section[] = [];
  let current: { level: number; heading: string; lines: string[] } | null =
    null;
  let inFence = false;
  let fenceMarker = "";

  const flush = () => {
    if (current === null) return;
    sections.push({
      id: String(sections.length),
      level: current.level,
      heading: current.heading,
      content: current.lines.join("\n"),
    });
  };

  for (const line of lines) {
    const fenceMatch = line.match(/^(\s*)(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[2][0];
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (marker === fenceMarker) {
        inFence = false;
        fenceMarker = "";
      }
    }

    const headingMatch = inFence ? null : line.match(HEADING_RE);
    if (headingMatch) {
      flush();
      current = {
        level: headingMatch[1].length,
        heading: headingMatch[2].trim(),
        lines: [line],
      };
    } else {
      if (current === null) {
        // Leading content before any heading → preamble section.
        current = { level: 0, heading: "", lines: [line] };
      } else {
        current.lines.push(line);
      }
    }
  }
  flush();

  // Drop a preamble that is only whitespace.
  return sections.filter(
    (s) => !(s.level === 0 && s.content.trim() === "")
  );
}

/**
 * Replace the section at `id` with `replacement` and return the full document.
 * If the id is not found, the original document is returned unchanged.
 */
export function spliceSection(
  markdown: string,
  id: string,
  replacement: string
): string {
  const sections = splitSections(markdown);
  const idx = sections.findIndex((s) => s.id === id);
  if (idx === -1) return markdown;
  const trimmed = replacement.replace(/\s+$/, "");
  return sections
    .map((s, i) => (i === idx ? trimmed : s.content.replace(/\s+$/, "")))
    .join("\n\n");
}

/** A short human label for a section, for use in lists / buttons. */
export function sectionLabel(section: Section): string {
  if (section.heading) return section.heading;
  const firstLine = section.content
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!firstLine) return "(空白段)";
  return firstLine.length > 24 ? firstLine.slice(0, 24) + "…" : firstLine;
}
