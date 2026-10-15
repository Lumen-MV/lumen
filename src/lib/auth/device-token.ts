import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/sqlite-client";
import { getEnv } from "@/lib/config/env";
import { generateToken, looksLikeToken } from "./invite-token";

/**
 * Stremio manifest capability tokens (`device_tokens`, stored raw so Settings can re-display the URL). One active token
 * per user: `rotate` revokes every live one and issues a fresh token; `revoke` leaves the user without a link until
 * "Tạo link mới". The addon routes resolve a token → user with `resolveDeviceToken` (revoked / unknown / disabled → null).
 */
export type DeviceTokenRow = typeof schema.deviceTokens.$inferSelect;
export type DeviceTokenState = { token: string | null; url: string | null; masked: string | null; revoked: boolean; lastUsedAt: string | null; createdAt: string | null };
const USED_THROTTLE_MS = 60_000;

export const manifestUrlFor = (token: string): string => `${getEnv().APP_URL}/stremio/${token}/manifest.json`;

/** `https://phim.example.com/stremio/k3Jd…Qw/manifest.json` — first 4 + last 2 characters of the token (mockup masking). */
export function maskManifestUrl(url: string): string {
  return url.replace(/\/stremio\/([A-Za-z0-9_-]{32})\//, (_, t: string) => `/stremio/${t.slice(0, 4)}…${t.slice(-2)}/`);
}

export function activeDeviceToken(userId: number): DeviceTokenRow | null {
  return getDb().select().from(schema.deviceTokens).where(and(eq(schema.deviceTokens.userId, userId), isNull(schema.deviceTokens.revokedAt))).orderBy(desc(schema.deviceTokens.createdAt)).get() ?? null;
}

function latestDeviceToken(userId: number): DeviceTokenRow | null {
  return getDb().select().from(schema.deviceTokens).where(eq(schema.deviceTokens.userId, userId)).orderBy(desc(schema.deviceTokens.createdAt)).get() ?? null;
}

function issue(userId: number, label: string): DeviceTokenRow {
  return getDb().insert(schema.deviceTokens).values({ token: generateToken(), userId, label }).returning().get();
}

/** Onboarding QR: the active token, or a new one when the user never had / revoked theirs. */
export function ensureDeviceToken(userId: number, label = "Android TV"): { token: string; manifestUrl: string } {
  const row = activeDeviceToken(userId) ?? issue(userId, label);
  return { token: row.token, manifestUrl: manifestUrlFor(row.token) };
}

function toState(row: DeviceTokenRow | null): DeviceTokenState {
  if (!row || row.revokedAt) return { token: null, url: null, masked: null, revoked: Boolean(row), lastUsedAt: null, createdAt: row?.createdAt.toISOString() ?? null };
  const url = manifestUrlFor(row.token);
  return { token: row.token, url, masked: maskManifestUrl(url), revoked: false, lastUsedAt: row.lastUsedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() };
}

/** Settings "Thiết bị & TV": active link, or `revoked:true` after "Thu hồi link"; a user who never had one gets one now. */
export function describeDeviceToken(userId: number): DeviceTokenState {
  const latest = latestDeviceToken(userId);
  return toState(latest ?? issue(userId, "Android TV"));
}

/** "Thu hồi link": every live token of the user is revoked (also used by the admin ⋯ menu and account lock). */
export function revokeDeviceTokens(userId: number, now = new Date()): number {
  return getDb().update(schema.deviceTokens).set({ revokedAt: now }).where(and(eq(schema.deviceTokens.userId, userId), isNull(schema.deviceTokens.revokedAt))).run().changes;
}

/** "Tạo link mới": revoke + issue. */
export function rotateDeviceToken(userId: number): DeviceTokenState {
  revokeDeviceTokens(userId);
  return toState(issue(userId, "Android TV"));
}

export type ResolvedDevice = { user: typeof schema.users.$inferSelect; token: DeviceTokenRow };

/** Addon routes: raw token → user (shape check first, no DB hit for junk). Revoked token or disabled user → null (route answers 404). */
export function resolveDeviceToken(token: string, now = new Date()): ResolvedDevice | null {
  if (!looksLikeToken(token)) return null;
  const db = getDb();
  const row = db.select({ token: schema.deviceTokens, user: schema.users }).from(schema.deviceTokens).innerJoin(schema.users, eq(schema.deviceTokens.userId, schema.users.id)).where(eq(schema.deviceTokens.token, token)).get();
  if (!row || row.token.revokedAt || row.user.disabled) return null;
  if (!row.token.lastUsedAt || now.getTime() - row.token.lastUsedAt.getTime() > USED_THROTTLE_MS) {
    db.update(schema.deviceTokens).set({ lastUsedAt: now }).where(eq(schema.deviceTokens.token, token)).run();
    db.update(schema.users).set({ lastSeenAt: now }).where(eq(schema.users.id, row.user.id)).run();
  }
  return { user: row.user, token: row.token };
}
