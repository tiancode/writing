import { describe, expect, it } from "vitest";
import {
  hashPassword,
  verifyPassword,
  isValidEmail,
  normalizeEmail,
} from "../auth";

describe("password hashing", () => {
  it("verifies a correct password", () => {
    const stored = hashPassword("hunter2pass");
    expect(verifyPassword("hunter2pass", stored)).toBe(true);
  });

  it("rejects a wrong password", () => {
    const stored = hashPassword("hunter2pass");
    expect(verifyPassword("wrongpass", stored)).toBe(false);
  });

  it("uses a random salt so two hashes of the same password differ", () => {
    expect(hashPassword("samepass123")).not.toBe(hashPassword("samepass123"));
  });

  it("rejects a malformed stored value", () => {
    expect(verifyPassword("x", "not-a-valid-hash")).toBe(false);
  });
});

describe("email helpers", () => {
  it("validates well-formed emails", () => {
    expect(isValidEmail("a@b.com")).toBe(true);
    expect(isValidEmail("user.name@example.co")).toBe(true);
  });

  it("rejects malformed emails", () => {
    expect(isValidEmail("nope")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("a @b.com")).toBe(false);
  });

  it("normalizes case and whitespace", () => {
    expect(normalizeEmail("  User@Example.COM ")).toBe("user@example.com");
  });
});
