import { randomInt } from "node:crypto";

/**
 * Admin "Đặt lại mật khẩu": a one-time temporary password shaped like the mockup's `Gk7-mPx2-Q9w` — three groups
 * (3 · 4 · 3) from an unambiguous alphabet (no 0/O, 1/l/I), joined by dashes. 10 characters ≈ 53 bits.
 * A temp password is only accepted at login for TEMP_PASSWORD_TTL_MS (48 h) after it was issued.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
export const TEMP_PASSWORD_RE = /^[A-Za-z2-9]{3}-[A-Za-z2-9]{4}-[A-Za-z2-9]{3}$/;
export const TEMP_PASSWORD_TTL_MS = 48 * 60 * 60 * 1000;

export function generateTempPassword(rand: (max: number) => number = randomInt): string {
  const group = (n: number) => Array.from({ length: n }, () => ALPHABET[rand(ALPHABET.length)]).join("");
  return `${group(3)}-${group(4)}-${group(3)}`;
}

/** Login rule: a temp password (must_change_password set) older than 48 h is refused; a missing issue time never expires (legacy rows). */
export function isTempPasswordExpired(user: { mustChangePassword: boolean; passwordResetAt: Date | null }, now = Date.now()): boolean {
  return user.mustChangePassword && user.passwordResetAt !== null && now - user.passwordResetAt.getTime() > TEMP_PASSWORD_TTL_MS;
}
