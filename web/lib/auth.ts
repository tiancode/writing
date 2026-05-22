import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { getDb } from "./db";
import { INITIAL_CREDITS } from "./billing";

export const SESSION_COOKIE = "session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SCRYPT_KEYLEN = 64;

export interface User {
  id: string;
  email: string;
  credits: number;
  createdAt: number;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  credits: number;
  created_at: number;
}

// ---- password hashing (pure, no DB) -------------------------------------

/** Returns "salt:derivedKey", both hex. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, keyHex] = stored.split(":");
  if (!saltHex || !keyHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(keyHex, "hex");
  const derived = scryptSync(password, salt, expected.length);
  return (
    derived.length === expected.length && timingSafeEqual(derived, expected)
  );
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ---- user + session (DB) ------------------------------------------------

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    credits: row.credits,
    createdAt: row.created_at,
  };
}

export class EmailTakenError extends Error {
  constructor() {
    super("该邮箱已注册");
    this.name = "EmailTakenError";
  }
}

export function createUser(email: string, password: string): User {
  const db = getDb();
  const normalized = normalizeEmail(email);
  const existing = db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(normalized);
  if (existing) throw new EmailTakenError();

  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO users (id, email, password_hash, credits, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, normalized, hashPassword(password), INITIAL_CREDITS, now);

  return { id, email: normalized, credits: INITIAL_CREDITS, createdAt: now };
}

export function authenticate(email: string, password: string): User | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(normalizeEmail(email)) as UserRow | undefined;
  if (!row) return null;
  if (!verifyPassword(password, row.password_hash)) return null;
  return rowToUser(row);
}

export function getUserById(id: string): User | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as
    | UserRow
    | undefined;
  return row ? rowToUser(row) : null;
}

export function createSession(userId: string): string {
  const db = getDb();
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  db.prepare(
    `INSERT INTO sessions (token, user_id, created_at, expires_at)
     VALUES (?, ?, ?, ?)`
  ).run(token, userId, now, now + SESSION_TTL_MS);
  return token;
}

export function deleteSession(token: string): void {
  getDb().prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export function getUserBySession(token: string | undefined): User | null {
  if (!token) return null;
  const db = getDb();
  const session = db
    .prepare("SELECT user_id, expires_at FROM sessions WHERE token = ?")
    .get(token) as { user_id: string; expires_at: number } | undefined;
  if (!session) return null;
  if (session.expires_at < Date.now()) {
    deleteSession(token);
    return null;
  }
  return getUserById(session.user_id);
}

/** Cookie attributes for the session cookie. */
export function sessionCookieOptions(maxAgeMs = SESSION_TTL_MS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(maxAgeMs / 1000),
  };
}
