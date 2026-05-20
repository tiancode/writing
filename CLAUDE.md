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

When editing a scenario, remember it powers both surfaces. The system prompt should not assume tool-use ability — Web's `buildSystemPrompt()` appends a **"Web Mode Override"** block forbidding tool-call phrasing and requiring inline Markdown output, but the base system.md text is shared.

### CLI runtime model

`src/index.ts` parses argv → `src/agent.ts` calls `query()` from `@anthropic-ai/claude-agent-sdk` with:
- `systemPrompt: { type: "preset", preset: "claude_code", append: <built prompt> }`
- `allowedTools: ["Read", "Write", "Edit", "Glob", "Grep"]`
- `cwd: process.cwd()`
- `permissionMode: "acceptEdits"` — **the agent writes anywhere in cwd with no human confirmation**

Default output dir is `./output/` (gitignored). The agent is told to save into that directory via the appended system prompt, but `acceptEdits` does not enforce it — when developing, run from a throwaway directory if the agent's output might collide with the repo.

### Web runtime model

`web/app/api/generate/route.ts` is a Node-runtime SSE endpoint (not Edge — needed for streaming + the Anthropic SDK). Flow:
1. Receives `{ scenarioId, formData }`.
2. Validates required fields (respecting `showIf` conditional visibility) via the form schema.
3. `buildRequirement()` formats form values into a labeled requirement string.
4. `buildSystemPrompt()` composes scenario system.md + style + templates + the Web Mode Override.
5. Streams `messages.stream()` text deltas as SSE `text` events, ending with a `done` event carrying token usage.

Model / temperature / max tokens are **per-scenario**, set in `form.json` (e.g. `novel` uses higher temperature). The form schema also describes the field UI: `type`, `placeholder`, `required`, `rows`, `showIf` for conditional fields, etc. — see `web/lib/scenarios.ts` `FormField` for the contract.

## Build artifacts

`npm run build` (root) outputs to `dist/`:
- `tsc` compiles TS → JS.
- `scripts/copy-assets.mjs` mirrors `src/scenarios` → `dist/scenarios` excluding `.ts` files (i.e. the `registry.ts` is compiled, the markdown/json scenario assets are copied). The `bin` entry `writing-agent` points at `dist/index.js`.

Web is a standard Next.js build; nothing custom.

## Things to be careful about

- **CLI writes are unconfirmed.** The agent runs with `acceptEdits` against `process.cwd()`. Don't run it from the repo root unless you mean to.
- **External-file scenarios are vulnerable to prompt injection.** `bid-doc` and `novel` are designed to Read user-supplied files (tender docs, references). The README explicitly warns: only use with trusted inputs.
- **Scenario edits touch both surfaces.** A change to `prompts/system.md` affects the CLI immediately and the Web UI on next request. Test both, or at minimum confirm the Web Mode Override still neutralizes any new tool-use phrasing you introduce.
- **Web depends on `../src/scenarios` at runtime.** Don't move the scenarios directory without updating `web/lib/scenarios.ts`. The Web app is not buildable in isolation from the root `src/` tree.
