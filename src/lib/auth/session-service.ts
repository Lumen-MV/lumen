import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, lt, ne, or } from "drizzle-orm";
import { UAParser } from "ua-parser-js";
import { getDb, schema } from "@/lib/db/sqlite-client";
import { getEnv } from "@/lib/config/env";
import { SESSION_IDLE_TTL_S, SESSION_TTL_S } from "./session-config";

/** "Chrome · Windows", "Safari · iPhone" — label shown in the Phiên đăng nhập list. */
export function deviceLabelFromUserAgent(ua: string): string {
  const r = UAParser(ua || "");
  const browser = r.browser.name ?? "Browser";
  const device = r.device.model && /iphone|ipad/i.test(r.device.model) ? r.device.model : r.os.name;
  return `${browser} · ${device ?? "?"}`;
}

/**
 * Rate-limit / audit key. Forwarded headers are only honoured with TRUST_PROXY=1 (Caddy rewrites
 * x-forwarded-for); otherwise they are attacker-controlled and every caller shares one bucket.
 */
export function clientIp(req: Request): string {
  if (getEnv().TRUST_PROXY !== "1") return "unknown";
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip");
  return fwd?.trim() || "unknown";
}

/** Creates a `sessions` row for a login; the cookie only carries the returned id. */
export function createSession(userId: number, req: Request, remember: boolean): string {
  const id = randomBytes(24).toString("base64url");
  const ua = req.headers.get("user-agent") ?? "";
  getDb()
    .insert(schema.sessions)
    .values({ id, userId, deviceLabel: deviceLabelFromUserAgent(ua), userAgent: ua, ip: clientIp(req), remember })
    .run();
  return id;
}

export function deleteSession(id: string): void {
  getDb().delete(schema.sessions).where(eq(schema.sessions.id, id)).run();
}

export function deleteOtherSessions(userId: number, keepId: string): void {
  getDb()
    .delete(schema.sessions)
    .where(and(eq(schema.sessions.userId, userId), ne(schema.sessions.id, keepId)))
    .run();
}

/** Server-side lifetime: 30 days (remember) or 24 h (browser session) of inactivity, measured from last_seen_at. */
export function isSessionExpired(s: { remember: boolean; lastSeenAt: Date }, now = Date.now()): boolean {
  const ttlMs = (s.remember ? SESSION_TTL_S : SESSION_IDLE_TTL_S) * 1000;
  return now - s.lastSeenAt.getTime() > ttlMs;
}

/** Deletes every expired row (boot + each login) so the Phase 6 session list never shows ghosts. */
export function pruneExpiredSessions(now = Date.now()): number {
  const rememberCutoff = new Date(now - SESSION_TTL_S * 1000);
  const idleCutoff = new Date(now - SESSION_IDLE_TTL_S * 1000);
  return getDb()
    .delete(schema.sessions)
    .where(
      or(
        and(eq(schema.sessions.remember, true), lt(schema.sessions.lastSeenAt, rememberCutoff)),
        and(eq(schema.sessions.remember, false), lt(schema.sessions.lastSeenAt, idleCutoff)),
      ),
    )
    .run().changes;
}

export function listSessions(userId: number, currentId: string) {
  return getDb()
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.userId, userId))
    .all()
    .map((s) => ({ id: s.id, deviceLabel: s.deviceLabel, lastSeenAt: s.lastSeenAt.toISOString(), createdAt: s.createdAt.toISOString(), current: s.id === currentId }));
}
