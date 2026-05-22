import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { dirname, join, isAbsolute } from "node:path";

// node:sqlite is experimental in Node 22 and not present in the bundlers'
// builtin lists (vite/vitest, webpack), so a static `import from "node:sqlite"`
// gets mis-resolved. Load it through createRequire so it's a plain runtime
// Node require that both toolchains leave untouched. The type-only import above
// is erased at compile time.
const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");

// Single-instance SQLite store. Self-contained: no external DB server, no
// native build (node:sqlite ships with Node >= 22). For multi-instance
// production, swap this module for a Postgres-backed pool — the repository /
// auth layers only depend on the exported `db` handle's SQL.

function resolveDbPath(): string {
  const configured = process.env.DATABASE_PATH;
  if (configured && configured !== ":memory:") {
    return isAbsolute(configured)
      ? configured
      : join(process.cwd(), configured);
  }
  if (configured === ":memory:") return ":memory:";
  return join(process.cwd(), "data", "app.db");
}

let instance: DatabaseSyncType | null = null;

export function getDb(): DatabaseSyncType {
  if (instance) return instance;
  const path = resolveDbPath();
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  instance = db;
  return db;
}

function migrate(db: DatabaseSyncType): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      credits       INTEGER NOT NULL DEFAULT 0,
      created_at    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS projects (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title       TEXT NOT NULL,
      scenario_id TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);

    CREATE TABLE IF NOT EXISTS documents (
      id          TEXT PRIMARY KEY,
      project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title       TEXT NOT NULL,
      scenario_id TEXT NOT NULL,
      content     TEXT NOT NULL,
      form_data   TEXT NOT NULL DEFAULT '{}',
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id);
    CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id);

    CREATE TABLE IF NOT EXISTS usage_events (
      id                  TEXT PRIMARY KEY,
      user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      scenario_id         TEXT NOT NULL,
      kind                TEXT NOT NULL,
      input_tokens        INTEGER NOT NULL,
      output_tokens       INTEGER NOT NULL,
      cache_read_tokens   INTEGER NOT NULL,
      cache_create_tokens INTEGER NOT NULL,
      credits_charged     INTEGER NOT NULL,
      created_at          INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_events(user_id);
  `);
}

/** Test helper: drop the cached handle so the next getDb() reopens. */
export function __resetDbForTests(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}
