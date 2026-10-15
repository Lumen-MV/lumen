import { describe, expect, it } from "vitest";
import { isPasswordAcceptable, scorePassword, strengthColor, strengthLevel } from "@/lib/auth/password-strength";

describe("password strength", () => {
  it("scores empty as 0 and short/simple as weak (< 40, red)", () => {
    expect(scorePassword("")).toBe(0);
    const s = scorePassword("abcabc");
    expect(s).toBeLessThan(40);
    expect(strengthLevel(s)).toBe("weak");
    expect(strengthColor(s)).toBe("#e50914");
  });

  it("scores a 10-char mixed password as strong (>= 75, green)", () => {
    const s = scorePassword("Bao123456");
    expect(s).toBeGreaterThanOrEqual(75);
    expect(strengthLevel(s)).toBe("strong");
    expect(strengthColor(s)).toBe("#46d369");
  });

  it("penalises obvious sequences and clamps to 0..100", () => {
    expect(scorePassword("12345678")).toBeLessThan(scorePassword("83619274"));
    expect(scorePassword("aaaaaaaaaaaa")).toBeLessThan(scorePassword("k9!Qz2#mLp"));
    expect(scorePassword("Xy9!Xy9!Xy9!Xy9!Xy9!Xy9!")).toBeLessThanOrEqual(100);
  });

  it("accepts only >= 8 characters server-side", () => {
    expect(isPasswordAcceptable("1234567")).toBe(false);
    expect(isPasswordAcceptable("12345678")).toBe(true);
  });
});
