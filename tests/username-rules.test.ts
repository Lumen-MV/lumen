import { describe, expect, it } from "vitest";
import { normalizeUsername, slugifyUsername, USERNAME_RE } from "@/lib/users/username-rules";
import { generateToken, hashToken, looksLikeToken } from "@/lib/auth/invite-token";

describe("username rules", () => {
  it("validates ^[a-z0-9_]{3,20}$", () => {
    expect(USERNAME_RE.test("bao")).toBe(true);
    expect(USERNAME_RE.test("hi")).toBe(false);
    expect(USERNAME_RE.test("Bao")).toBe(false);
    expect(USERNAME_RE.test("bao nguyen")).toBe(false);
    expect(USERNAME_RE.test("a".repeat(21))).toBe(false);
  });

  it("normalizes and slugifies Vietnamese display names", () => {
    expect(normalizeUsername("  Bao ")).toBe("bao");
    expect(slugifyUsername("Bảo")).toBe("bao");
    expect(slugifyUsername("Đặng Văn Khang")).toBe("dangvankhang");
    expect(slugifyUsername("!!!")).toBe("");
  });
});

describe("invite tokens", () => {
  it("generates 32-char base64url tokens and stable sha256 hashes", () => {
    const t = generateToken();
    expect(looksLikeToken(t)).toBe(true);
    expect(hashToken(t)).toHaveLength(64);
    expect(hashToken(t)).toBe(hashToken(t));
    expect(looksLikeToken("short")).toBe(false);
    expect(looksLikeToken("x".repeat(31) + "/")).toBe(false);
  });
});
