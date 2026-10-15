import { createHash, randomBytes } from "node:crypto";

/** Invite/device tokens: 24 random bytes base64url in the URL; only the sha256 hex is stored. */
export function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Token shape check before touching the DB (base64url of 24 bytes = 32 chars). */
export function looksLikeToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{32}$/.test(token);
}
