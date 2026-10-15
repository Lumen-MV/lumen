import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/sqlite-client";
import { readSessionIdFromCookies } from "./session-cookie";
import { deleteSession, isSessionExpired } from "./session-service";
import { toPublicUser, type PublicUser } from "@/lib/users/user-service";

export type SessionUser = { user: PublicUser; sessionId: string };

const SEEN_THROTTLE_MS = 60_000;

/**
 * Resolves the current request's session row → user. Returns null when the cookie is missing,
 * the session row was deleted (logout elsewhere / lock), the row has expired server-side
 * (30 d remember / 24 h otherwise, since last activity) or the user is disabled.
 * Cached per request so layout + page + API share one lookup.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const sessionId = await readSessionIdFromCookies();
  if (!sessionId) return null;
  const db = getDb();
  const row = db
    .select({ session: schema.sessions, user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .where(eq(schema.sessions.id, sessionId))
    .get();
  if (!row || row.user.disabled) return null;

  const now = new Date();
  if (isSessionExpired(row.session, now.getTime())) {
    deleteSession(sessionId);
    return null;
  }
  if (now.getTime() - row.session.lastSeenAt.getTime() > SEEN_THROTTLE_MS) {
    db.update(schema.sessions).set({ lastSeenAt: now }).where(eq(schema.sessions.id, sessionId)).run();
    db.update(schema.users).set({ lastSeenAt: now }).where(eq(schema.users.id, row.user.id)).run();
  }
  return { user: toPublicUser(row.user), sessionId };
});
