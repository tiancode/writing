import { beforeAll, afterAll, describe, expect, it } from "vitest";

// Point the DB at an in-memory SQLite before any module calls getDb().
process.env.DATABASE_PATH = ":memory:";

import { __resetDbForTests } from "../db";
import {
  createUser,
  authenticate,
  createSession,
  getUserBySession,
  deleteSession,
} from "../auth";
import {
  createProject,
  createDocument,
  getDocument,
  listDocuments,
  updateDocument,
  deleteDocument,
  ensureDefaultProject,
  chargeUsage,
  getBalance,
} from "../repository";
import { INITIAL_CREDITS } from "../billing";

afterAll(() => __resetDbForTests());

describe("user + session round trip", () => {
  it("creates, authenticates, and resolves a session", () => {
    const user = createUser("alice@example.com", "password123");
    expect(user.credits).toBe(INITIAL_CREDITS);

    expect(authenticate("alice@example.com", "password123")).not.toBeNull();
    expect(authenticate("alice@example.com", "wrong")).toBeNull();
    // email is case-insensitive
    expect(authenticate("ALICE@example.com", "password123")?.id).toBe(user.id);

    const token = createSession(user.id);
    expect(getUserBySession(token)?.id).toBe(user.id);
    deleteSession(token);
    expect(getUserBySession(token)).toBeNull();
  });

  it("rejects duplicate emails", () => {
    createUser("bob@example.com", "password123");
    expect(() => createUser("bob@example.com", "password123")).toThrow();
  });
});

describe("documents", () => {
  it("creates, reads, updates, and deletes a document", () => {
    const user = createUser("carol@example.com", "password123");
    const project = createProject(user.id, "我的书", "novel");

    const doc = createDocument({
      projectId: project.id,
      userId: user.id,
      title: "第一章",
      scenarioId: "novel",
      content: "# 第一章\n\n内容",
      formData: { mode: "写一章正文" },
    });

    expect(getDocument(doc.id, user.id)?.content).toContain("第一章");
    expect(getDocument(doc.id, "someone-else")).toBeNull();

    const updated = updateDocument(doc.id, user.id, { content: "# 改了" });
    expect(updated?.content).toBe("# 改了");

    expect(listDocuments(user.id)).toHaveLength(1);
    expect(deleteDocument(doc.id, user.id)).toBe(true);
    expect(listDocuments(user.id)).toHaveLength(0);
  });

  it("ensureDefaultProject is idempotent per scenario", () => {
    const user = createUser("dave@example.com", "password123");
    const a = ensureDefaultProject(user.id, "novel");
    const b = ensureDefaultProject(user.id, "novel");
    expect(a.id).toBe(b.id);
    const c = ensureDefaultProject(user.id, "bid-doc");
    expect(c.id).not.toBe(a.id);
  });
});

describe("credits", () => {
  it("deducts credits and clamps at zero", () => {
    const user = createUser("erin@example.com", "password123");
    const before = getBalance(user.id);
    const { charged, remaining } = chargeUsage(user.id, "novel", "generate", {
      inputTokens: 100,
      outputTokens: 100,
      cacheReadTokens: 0,
      cacheCreateTokens: 0,
    });
    expect(charged).toBe(600);
    expect(remaining).toBe(before - 600);

    // Overspend clamps to 0, never negative.
    chargeUsage(user.id, "novel", "generate", {
      inputTokens: 10_000_000,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreateTokens: 0,
    });
    expect(getBalance(user.id)).toBe(0);
  });
});
