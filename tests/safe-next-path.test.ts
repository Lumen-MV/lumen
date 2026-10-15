import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/auth/safe-next-path";

describe("safeNextPath", () => {
  const origin = "https://movie.example";

  it("keeps same-origin paths with query and hash", () => {
    expect(safeNextPath("/settings?x=1#a", origin)).toBe("/settings?x=1#a");
    expect(safeNextPath("/admin", origin)).toBe("/admin");
    expect(safeNextPath("/", origin)).toBe("/");
  });

  it("rejects protocol-relative, backslash and absolute redirects", () => {
    expect(safeNextPath("//evil.com/x", origin)).toBe("/");
    expect(safeNextPath("/\\evil.com", origin)).toBe("/");
    expect(safeNextPath("/\\\\evil.com", origin)).toBe("/");
    expect(safeNextPath("https://evil.com/", origin)).toBe("/");
    expect(safeNextPath("javascript:alert(1)", origin)).toBe("/");
    expect(safeNextPath("settings", origin)).toBe("/");
  });

  it("falls back to / for empty input", () => {
    expect(safeNextPath(undefined, origin)).toBe("/");
    expect(safeNextPath("", origin)).toBe("/");
    expect(safeNextPath(null)).toBe("/");
  });
});
