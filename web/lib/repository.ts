import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { creditsForUsage, type TokenUsage } from "./billing";

export interface Project {
  id: string;
  userId: string;
  title: string;
  scenarioId: string;
  createdAt: number;
  updatedAt: number;
  documentCount?: number;
}

export interface DocumentRecord {
  id: string;
  projectId: string;
  userId: string;
  title: string;
  scenarioId: string;
  content: string;
  formData: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

// ---- projects -----------------------------------------------------------

export function createProject(
  userId: string,
  title: string,
  scenarioId: string
): Project {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO projects (id, user_id, title, scenario_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, userId, title, scenarioId, now, now);
  return { id, userId, title, scenarioId, createdAt: now, updatedAt: now };
}

export function listProjects(userId: string): Project[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT p.*, COUNT(d.id) AS document_count
       FROM projects p
       LEFT JOIN documents d ON d.project_id = p.id
       WHERE p.user_id = ?
       GROUP BY p.id
       ORDER BY p.updated_at DESC`
    )
    .all(userId) as Array<{
    id: string;
    user_id: string;
    title: string;
    scenario_id: string;
    created_at: number;
    updated_at: number;
    document_count: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    title: r.title,
    scenarioId: r.scenario_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    documentCount: r.document_count,
  }));
}

export function getProject(id: string, userId: string): Project | null {
  const db = getDb();
  const r = db
    .prepare("SELECT * FROM projects WHERE id = ? AND user_id = ?")
    .get(id, userId) as
    | {
        id: string;
        user_id: string;
        title: string;
        scenario_id: string;
        created_at: number;
        updated_at: number;
      }
    | undefined;
  if (!r) return null;
  return {
    id: r.id,
    userId: r.user_id,
    title: r.title,
    scenarioId: r.scenario_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function deleteProject(id: string, userId: string): boolean {
  const res = getDb()
    .prepare("DELETE FROM projects WHERE id = ? AND user_id = ?")
    .run(id, userId);
  return res.changes > 0;
}

/** Find-or-create a default project for a scenario so saving needs no setup. */
export function ensureDefaultProject(
  userId: string,
  scenarioId: string
): Project {
  const db = getDb();
  const existing = db
    .prepare(
      `SELECT * FROM projects WHERE user_id = ? AND scenario_id = ? AND title = ?`
    )
    .get(userId, scenarioId, "默认项目") as
    | {
        id: string;
        user_id: string;
        title: string;
        scenario_id: string;
        created_at: number;
        updated_at: number;
      }
    | undefined;
  if (existing) {
    return {
      id: existing.id,
      userId: existing.user_id,
      title: existing.title,
      scenarioId: existing.scenario_id,
      createdAt: existing.created_at,
      updatedAt: existing.updated_at,
    };
  }
  return createProject(userId, "默认项目", scenarioId);
}

// ---- documents ----------------------------------------------------------

function rowToDocument(r: {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  scenario_id: string;
  content: string;
  form_data: string;
  created_at: number;
  updated_at: number;
}): DocumentRecord {
  let formData: Record<string, string> = {};
  try {
    formData = JSON.parse(r.form_data);
  } catch {
    formData = {};
  }
  return {
    id: r.id,
    projectId: r.project_id,
    userId: r.user_id,
    title: r.title,
    scenarioId: r.scenario_id,
    content: r.content,
    formData,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function createDocument(input: {
  projectId: string;
  userId: string;
  title: string;
  scenarioId: string;
  content: string;
  formData?: Record<string, string>;
}): DocumentRecord {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO documents
       (id, project_id, user_id, title, scenario_id, content, form_data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.projectId,
    input.userId,
    input.title,
    input.scenarioId,
    input.content,
    JSON.stringify(input.formData ?? {}),
    now,
    now
  );
  db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(
    now,
    input.projectId
  );
  return {
    id,
    projectId: input.projectId,
    userId: input.userId,
    title: input.title,
    scenarioId: input.scenarioId,
    content: input.content,
    formData: input.formData ?? {},
    createdAt: now,
    updatedAt: now,
  };
}

export function getDocument(id: string, userId: string): DocumentRecord | null {
  const db = getDb();
  const r = db
    .prepare("SELECT * FROM documents WHERE id = ? AND user_id = ?")
    .get(id, userId) as Parameters<typeof rowToDocument>[0] | undefined;
  return r ? rowToDocument(r) : null;
}

export function listDocuments(userId: string): DocumentRecord[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM documents WHERE user_id = ? ORDER BY updated_at DESC"
    )
    .all(userId) as Array<Parameters<typeof rowToDocument>[0]>;
  return rows.map(rowToDocument);
}

export function updateDocument(
  id: string,
  userId: string,
  patch: { title?: string; content?: string }
): DocumentRecord | null {
  const existing = getDocument(id, userId);
  if (!existing) return null;
  const db = getDb();
  const now = Date.now();
  const title = patch.title ?? existing.title;
  const content = patch.content ?? existing.content;
  db.prepare(
    "UPDATE documents SET title = ?, content = ?, updated_at = ? WHERE id = ? AND user_id = ?"
  ).run(title, content, now, id, userId);
  db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(
    now,
    existing.projectId
  );
  return { ...existing, title, content, updatedAt: now };
}

export function deleteDocument(id: string, userId: string): boolean {
  const res = getDb()
    .prepare("DELETE FROM documents WHERE id = ? AND user_id = ?")
    .run(id, userId);
  return res.changes > 0;
}

// ---- credits + usage ----------------------------------------------------

export function getBalance(userId: string): number {
  const db = getDb();
  const r = db.prepare("SELECT credits FROM users WHERE id = ?").get(userId) as
    | { credits: number }
    | undefined;
  return r?.credits ?? 0;
}

/**
 * Deduct credits for one API call, clamped at zero, and record a usage event.
 * Returns the charged amount and the remaining balance.
 */
export function chargeUsage(
  userId: string,
  scenarioId: string,
  kind: string,
  usage: TokenUsage
): { charged: number; remaining: number } {
  const db = getDb();
  const charged = creditsForUsage(usage);
  const now = Date.now();

  db.prepare(
    "UPDATE users SET credits = MAX(0, credits - ?) WHERE id = ?"
  ).run(charged, userId);

  db.prepare(
    `INSERT INTO usage_events
       (id, user_id, scenario_id, kind, input_tokens, output_tokens,
        cache_read_tokens, cache_create_tokens, credits_charged, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    randomUUID(),
    userId,
    scenarioId,
    kind,
    usage.inputTokens,
    usage.outputTokens,
    usage.cacheReadTokens,
    usage.cacheCreateTokens,
    charged,
    now
  );

  return { charged, remaining: getBalance(userId) };
}
