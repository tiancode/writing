import { resolve, relative, sep } from "node:path";
import type {
  HookCallback,
  HookInput,
  HookJSONOutput,
} from "@anthropic-ai/claude-agent-sdk";

const WRITE_TOOLS = new Set(["Write", "Edit", "NotebookEdit"]);
const READ_TOOLS = new Set(["Read", "Glob", "Grep"]);

export interface PathGuardOptions {
  /** The only directory where writes (Write / Edit) are allowed. */
  outputDir: string;
  /**
   * Extra absolute paths the agent may Read / Glob / Grep but not modify.
   * Used for external materials like tender docs, references.
   */
  inputPaths?: string[];
  /** Optional logger for audit visibility. */
  onDeny?: (toolName: string, path: string, reason: string) => void;
}

export function isPathInside(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  if (rel === "") return true;
  if (rel.startsWith("..")) return false;
  if (rel.startsWith("/")) return false;
  if (rel.startsWith(sep)) return false;
  return true;
}

function extractPath(toolName: string, input: unknown): string | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const obj = input as Record<string, unknown>;
  if (toolName === "Read" || toolName === "Write" || toolName === "Edit" || toolName === "NotebookEdit") {
    const v = obj.file_path ?? obj.notebook_path;
    return typeof v === "string" ? v : undefined;
  }
  if (toolName === "Glob" || toolName === "Grep") {
    const v = obj.path;
    return typeof v === "string" ? v : undefined;
  }
  return undefined;
}

export interface PathCheckResult {
  allow: boolean;
  reason?: string;
  resolvedPath?: string;
}

export function checkPath(
  toolName: string,
  rawPath: string | undefined,
  opts: { outputDir: string; inputPaths: string[] }
): PathCheckResult {
  if (rawPath === undefined) {
    return { allow: true };
  }
  const resolved = resolve(opts.outputDir, rawPath);

  if (isPathInside(resolved, opts.outputDir)) {
    return { allow: true, resolvedPath: resolved };
  }

  if (WRITE_TOOLS.has(toolName)) {
    return {
      allow: false,
      resolvedPath: resolved,
      reason: `${toolName} blocked: writes are restricted to ${opts.outputDir}. Path ${resolved} is outside this directory.`,
    };
  }

  if (READ_TOOLS.has(toolName)) {
    for (const input of opts.inputPaths) {
      if (isPathInside(resolved, input)) {
        return { allow: true, resolvedPath: resolved };
      }
    }
    const allowedSummary = [opts.outputDir, ...opts.inputPaths].join(", ");
    return {
      allow: false,
      resolvedPath: resolved,
      reason: `${toolName} blocked: ${resolved} is outside the allowed paths (${allowedSummary}). To grant access, restart with --input <path>.`,
    };
  }

  return { allow: true };
}

export function createPathGuard(opts: PathGuardOptions): HookCallback {
  const outputDir = resolve(opts.outputDir);
  const inputPaths = (opts.inputPaths ?? []).map((p) => resolve(p));

  return async (input: HookInput): Promise<HookJSONOutput> => {
    if (input.hook_event_name !== "PreToolUse") {
      return {};
    }
    const toolName = input.tool_name;
    if (!WRITE_TOOLS.has(toolName) && !READ_TOOLS.has(toolName)) {
      return {};
    }

    const path = extractPath(toolName, input.tool_input);
    const result = checkPath(toolName, path, { outputDir, inputPaths });

    if (result.allow) {
      return {};
    }

    opts.onDeny?.(toolName, result.resolvedPath ?? path ?? "", result.reason ?? "");

    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: result.reason ?? "Path not allowed.",
      },
    };
  };
}
