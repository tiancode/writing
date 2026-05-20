import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { checkPath, isPathInside, createPathGuard } from "../sandbox.js";

describe("isPathInside", () => {
  it("returns true for paths inside the parent", () => {
    expect(isPathInside("/a/b/c", "/a/b")).toBe(true);
    expect(isPathInside("/a/b", "/a/b")).toBe(true);
    expect(isPathInside("/a/b/c/d.txt", "/a/b")).toBe(true);
  });

  it("returns false for paths outside the parent", () => {
    expect(isPathInside("/a/c", "/a/b")).toBe(false);
    expect(isPathInside("/x", "/a/b")).toBe(false);
  });

  it("rejects traversal that resolves to a sibling", () => {
    const escaped = resolve("/a/b", "../c");
    expect(isPathInside(escaped, "/a/b")).toBe(false);
  });
});

describe("checkPath", () => {
  const outputDir = "/tmp/out";
  const inputs = ["/data/tender.md", "/refs"];

  it("allows writes inside outputDir", () => {
    expect(
      checkPath("Write", "/tmp/out/prd.md", { outputDir, inputPaths: inputs })
    ).toMatchObject({ allow: true });
  });

  it("allows writes via relative path (resolves against outputDir)", () => {
    expect(
      checkPath("Write", "prd.md", { outputDir, inputPaths: inputs })
    ).toMatchObject({ allow: true });
  });

  it("denies writes outside outputDir even if path is in inputs", () => {
    const r = checkPath("Write", "/data/tender.md", {
      outputDir,
      inputPaths: inputs,
    });
    expect(r.allow).toBe(false);
    expect(r.reason).toContain("writes are restricted");
  });

  it("allows reads inside outputDir", () => {
    expect(
      checkPath("Read", "/tmp/out/state/outline.md", {
        outputDir,
        inputPaths: inputs,
      })
    ).toMatchObject({ allow: true });
  });

  it("allows reads inside an explicit input path", () => {
    expect(
      checkPath("Read", "/data/tender.md", { outputDir, inputPaths: inputs })
    ).toMatchObject({ allow: true });
    expect(
      checkPath("Read", "/refs/style.md", { outputDir, inputPaths: inputs })
    ).toMatchObject({ allow: true });
  });

  it("denies reads outside outputDir and inputs", () => {
    const r = checkPath("Read", "/etc/passwd", {
      outputDir,
      inputPaths: inputs,
    });
    expect(r.allow).toBe(false);
    expect(r.reason).toContain("outside the allowed paths");
  });

  it("denies path-traversal escape from outputDir", () => {
    const r = checkPath("Write", "/tmp/out/../../etc/passwd", {
      outputDir,
      inputPaths: inputs,
    });
    expect(r.allow).toBe(false);
  });

  it("denies path-traversal escape from input dir on Read", () => {
    const r = checkPath("Read", "/refs/../etc/passwd", {
      outputDir,
      inputPaths: inputs,
    });
    expect(r.allow).toBe(false);
  });

  it("ignores tools that don't carry a path", () => {
    expect(
      checkPath("Read", undefined, { outputDir, inputPaths: inputs })
    ).toMatchObject({ allow: true });
  });
});

describe("createPathGuard hook", () => {
  const guard = createPathGuard({
    outputDir: "/tmp/out",
    inputPaths: ["/data"],
  });
  const signal = new AbortController().signal;
  const baseEvent = {
    session_id: "s",
    transcript_path: "/tmp/t",
    cwd: "/tmp/out",
    tool_use_id: "tu",
  };

  it("returns empty for non-PreToolUse events", async () => {
    const out = await guard(
      { ...baseEvent, hook_event_name: "Stop", stop_hook_active: false },
      undefined,
      { signal }
    );
    expect(out).toEqual({});
  });

  it("allows Write inside outputDir", async () => {
    const out = await guard(
      {
        ...baseEvent,
        hook_event_name: "PreToolUse",
        tool_name: "Write",
        tool_input: { file_path: "/tmp/out/draft.md", content: "..." },
      },
      "tu",
      { signal }
    );
    expect(out).toEqual({});
  });

  it("denies Write outside outputDir with a deny decision", async () => {
    const out = await guard(
      {
        ...baseEvent,
        hook_event_name: "PreToolUse",
        tool_name: "Write",
        tool_input: { file_path: "/etc/passwd", content: "..." },
      },
      "tu",
      { signal }
    );
    expect(out).toMatchObject({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
      },
    });
  });

  it("allows Read inside an input path", async () => {
    const out = await guard(
      {
        ...baseEvent,
        hook_event_name: "PreToolUse",
        tool_name: "Read",
        tool_input: { file_path: "/data/tender.md" },
      },
      "tu",
      { signal }
    );
    expect(out).toEqual({});
  });

  it("denies Read outside outputDir and inputs", async () => {
    const out = await guard(
      {
        ...baseEvent,
        hook_event_name: "PreToolUse",
        tool_name: "Read",
        tool_input: { file_path: "/etc/passwd" },
      },
      "tu",
      { signal }
    );
    expect(out).toMatchObject({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
      },
    });
  });

  it("invokes onDeny callback with details", async () => {
    const denied: Array<[string, string]> = [];
    const g = createPathGuard({
      outputDir: "/tmp/out",
      inputPaths: [],
      onDeny: (tool, path) => denied.push([tool, path]),
    });
    await g(
      {
        ...baseEvent,
        hook_event_name: "PreToolUse",
        tool_name: "Read",
        tool_input: { file_path: "/etc/passwd" },
      },
      "tu",
      { signal }
    );
    expect(denied).toEqual([["Read", "/etc/passwd"]]);
  });
});
