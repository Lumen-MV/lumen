import { beforeEach, describe, expect, it } from "vitest";
import { clearAllLoginFailures, loginBlockedForS, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS, recordLoginFailure, resetLoginFailures } from "@/lib/auth/login-rate-limit";

describe("login rate limit", () => {
  beforeEach(() => clearAllLoginFailures());

  it("allows up to 4 failures, blocks on the 5th for the rest of the window", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < RATE_LIMIT_MAX - 1; i++) {
      recordLoginFailure("1.2.3.4", t0);
      expect(loginBlockedForS("1.2.3.4", t0)).toBe(0);
    }
    recordLoginFailure("1.2.3.4", t0 + 1000);
    const wait = loginBlockedForS("1.2.3.4", t0 + 2000);
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(RATE_LIMIT_WINDOW_MS / 1000);
  });

  it("expires after the window and is per IP", () => {
    const t0 = 5_000_000;
    for (let i = 0; i < RATE_LIMIT_MAX; i++) recordLoginFailure("9.9.9.9", t0);
    expect(loginBlockedForS("9.9.9.9", t0 + 10)).toBeGreaterThan(0);
    expect(loginBlockedForS("8.8.8.8", t0 + 10)).toBe(0);
    expect(loginBlockedForS("9.9.9.9", t0 + RATE_LIMIT_WINDOW_MS + 1)).toBe(0);
  });

  it("resets on successful login", () => {
    for (let i = 0; i < RATE_LIMIT_MAX; i++) recordLoginFailure("7.7.7.7");
    expect(loginBlockedForS("7.7.7.7")).toBeGreaterThan(0);
    resetLoginFailures("7.7.7.7");
    expect(loginBlockedForS("7.7.7.7")).toBe(0);
  });
});
