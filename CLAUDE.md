# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Scenario-driven AI writing tool. One set of scenario definitions (prompt + style + templates + form schema) under `src/scenarios/<id>/` drives **two surfaces** that share that directory:

- **CLI** (`src/`) — built on `@anthropic-ai/claude-agent-sdk`. Agent uses Read/Write/Edit/Glob/Grep tools to produce multi-file output. Runs in `permissionMode: "acceptEdits"` against the current working directory.
- **Web UI** (`web/`) — Next.js 15 + Anthropic Messages API (NOT the Agent SDK). Streaming SSE, no filesystem side effects, designed for non-technical end users.

Built-in scenarios: `project-doc`, `bid-doc`, `novel`. Adding a scenario means dropping a new directory under `src/scenarios/<id>/` containing `meta.json`, `prompts/system.md`, `templates/*.md`, `style.md`, and (for Web) `form.json` — both surfaces auto-discover at runtime, no TypeScript code changes needed.

## Common commands

CLI (run from repo root):

```bash
npm install
npm run dev list                                   # list available scenarios
npm run dev <scenario-id> "<requirement>" [--output ./dir]
npm run build        # tsc + scripts/copy-assets.mjs (copies non-.ts files from src/scenarios → dist/scenarios)
npm run typecheck    # tsc --noEmit
npm start            # run built CLI from dist/
```

Web (run from `web/`):

```bash
cd web
cp .env.example .env.local      # ANTHROPIC_API_KEY
npm install
npm run dev                     # http://localhost:3000
npm run build
npm run typecheck
```

There are no tests or linters configured. Use `npm run typecheck` in both packages to verify type correctness.

Node >= 20 required for both packages. The two `package.json` files are independent — `web/` is not a workspace member.

## Architecture

### Three-phase flow (Plan → Draft → Review)

The agent's job is structured as:
1. **Plan** — pick template, produce section-level outline with word-count estimates, ask 1–3 clarifying questions if scope is ambiguous.
2. **Draft** — write the document section-by-section (CLI: via Write tool; Web: inline Markdown in the stream).
3. **Review** — re-read, fix issues, append a short notes block listing assumptions, items needing user confirmation, and next steps.

The flow lives in the user prompt assembled in `src/agent.ts` (`buildUserPrompt`) and in the per-scenario `prompts/system.md`. The system prompt is composed by appending style guide + all templates + output-location instructions to the scenario's system.md.

### Scenario plugin layout

```
src/scenarios/<id>/
├── meta.json          # { "description": "..." }
├── form.json          # Web UI form schema (CLI ignores)
├── prompts/system.md  # scenario-specific system prompt
├── templates/*.md     # document skeletons (loaded by filename, sans .md)
└── style.md           # tone/voice/format rules
```

Two registries scan this same directory at runtime:

- `src/scenarios/registry.ts` — CLI loader. `listScenarios()` requires only `meta.json`.
- `web/lib/scenarios.ts` — Web loader. `listScenarios()` additionally **requires `form.json`** — scenarios without one are hidden from the web homepage but still usable from the CLI. Resolves the scenarios root via `resolve(__dirname, "..", "..", "src", "scenarios")`, so Web depends on the relative path to the root `src/` tree.

When editing a scenario, remember it powers both surfaces. The system prompt should not assume tool-use ability — Web's `buildSystemPrompt()` appends a **"Web Mode Override"** block that not only forbids tool-call phrasing and requires inline Markdown, but also collapses the three-phase flow: skip the Phase 1 Plan in user-facing output; if clarification is needed ask 1–3 questions and **stop** (no partial draft); after the document, append a "✍️ 审校提示" section listing assumptions and `<TBD: ...>` placeholders. The base `system.md` text is shared, so any new instructions there need to coexist with this override.

### CLI runtime model

`src/index.ts` loads `dotenv/config` then parses argv → `src/agent.ts` calls `query()` from `@anthropic-ai/claude-agent-sdk` with:
- `systemPrompt: { type: "preset", preset: "claude_code", append: <built prompt> }` — the appended block includes a "Reference Materials (read-only)" section listing any `--input` paths so the agent knows where to look.
- `allowedTools: ["Read", "Write", "Edit", "Glob", "Grep"]`
- `cwd: <absOutput>` — relative paths resolve here (default `./output/`).
- `permissionMode: "acceptEdits"` — no interactive prompts.
- `hooks: { PreToolUse: [pathGuard] }` — see `src/sandbox.ts`. `createPathGuard({ outputDir, inputPaths })` runs **before every** Read / Write / Edit / Glob / Grep and returns `{ permissionDecision: "deny", permissionDecisionReason }` for paths outside the whitelist. The agent sees the deny reason and adapts (no human intervention needed).
- `model: process.env.ANTHROPIC_MODEL` — optional override.

Sandbox rules (enforced by `checkPath` in `src/sandbox.ts`):
- **Write / Edit / NotebookEdit**: only inside `outputDir`. Even paths listed in `--input` are read-only.
- **Read / Glob / Grep**: `outputDir` ∪ all `--input` paths.
- Paths are resolved via `path.resolve` before checking, so `../` traversal is neutralized.
- Symlinks are **not** followed during the check — a symlink inside outputDir pointing outside will still be reachable. For hostile inputs use OS-level isolation (container, chroot).

Default output dir `./output/` is gitignored.

### Web runtime model

`web/app/api/generate/route.ts` is a Node-runtime SSE endpoint (not Edge — needed for streaming + the Anthropic SDK). Flow:
1. Per-IP rate limit (in-memory, single-instance only — `RATE_LIMIT_PER_HOUR`).
2. Receives `{ scenarioId, formData, followups? }`.
3. Validates required fields (respecting `showIf` conditional visibility), input character cap (`MAX_INPUT_CHARS`), and followup count cap (`MAX_FOLLOWUPS`).
4. `buildRequirement()` formats form values into a labeled requirement string.
5. `buildSystemPrompt()` composes scenario system.md + style + templates + the Web Mode Override. The system prompt is sent with `cache_control: { type: "ephemeral" }` for prompt caching — repeated calls to the same scenario reuse the system prompt cache.
6. Builds messages array: initial user requirement, then for each followup: `assistant(prev output)` + `user(new instruction)`.
7. Streams `messages.stream()` text deltas as SSE events: `start`, `text`, `done` (carries input/output/cache tokens), or `error`.

The Anthropic client is constructed in `web/lib/anthropic.ts`; a missing `ANTHROPIC_API_KEY` throws there and surfaces as a 503 from the route.

Model / temperature / max tokens are **per-scenario** (set in `form.json`). Model can be globally overridden via `ANTHROPIC_MODEL` env var. The form schema also describes the field UI: `type`, `placeholder`, `required`, `rows`, `showIf` for conditional fields — see `web/lib/scenarios.ts` `FormField`.

Client (`web/app/[scenario]/scenario-form.tsx`) uses `useDeferredValue(output)` for the markdown renderer to keep streaming smooth on long documents. The followup textarea appears after `done` and lets the user iteratively refine without re-filling the form (capped at 5 rounds to bound context growth).

## Build artifacts

`npm run build` (root) outputs to `dist/`:
- `tsc` compiles TS → JS.
- `scripts/copy-assets.mjs` mirrors `src/scenarios` → `dist/scenarios` excluding `.ts` files (i.e. the `registry.ts` is compiled, the markdown/json scenario assets are copied). The `bin` entry `writing-agent` points at `dist/index.js`.

Web is a standard Next.js build; nothing custom.

## Things to be careful about

- **CLI sandbox is path-based, not symlink-aware.** Write/Edit are restricted to outputDir; Read also requires explicit `--input` whitelisting. But a symlink inside outputDir pointing elsewhere still resolves through. Use OS-level isolation for hostile inputs.
- **External-file scenarios are vulnerable to prompt injection.** `bid-doc` and `novel` are designed to Read user-supplied files (tender docs, references). The README explicitly warns: only use with trusted inputs.
- **Scenario edits touch both surfaces.** A change to `prompts/system.md` affects the CLI immediately and the Web UI on next request. Test both, or at minimum confirm the Web Mode Override still neutralizes any new tool-use phrasing you introduce.
- **Web depends on `../src/scenarios` at runtime.** Don't move the scenarios directory without updating `web/lib/scenarios.ts`. The Web app is not buildable in isolation from the root `src/` tree.
- **Prompt builders are duplicated.** `src/agent.ts::buildSystemAppend` and `web/lib/scenarios.ts::buildSystemPrompt` are intentionally near-duplicates (no monorepo) — keep them in sync. Snapshot tests in `src/__tests__/` and `web/lib/__tests__/` catch structural drift, not content edits to scenario markdown.
- **Web rate limit is single-instance.** `rateBuckets` is in-process Map; restart clears it, multiple replicas don't share. Replace with Redis for real multi-instance deployment.
