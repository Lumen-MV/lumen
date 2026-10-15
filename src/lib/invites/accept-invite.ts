import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/sqlite-client";
import { hashPassword, normalizeUsername, USERNAME_RE, isUsernameAvailable, usernameSuggestions, type UserRow, avatarColorFor } from "@/lib/users/user-service";
import { isPasswordAcceptable } from "@/lib/auth/password-strength";
import { findInviteByToken, classifyInvite } from "./invite-service";
import { copy } from "@/lib/copy-vi";

/** Typed failure → the route maps it 1:1 to the API contract (status + code + extra). */
export class InviteError extends Error {
  constructor(public status: number, public code: string, public extra: Record<string, unknown> = {}) {
    super(code);
  }
}

export type AcceptInviteInput = { token: string; displayName: string; username: string; password: string };

/**
 * Creates the member, consumes the invite, logs the join and notifies the inviter — one transaction.
 * The invite is consumed with a conditional UPDATE (still unused / unexpired / unrevoked) so two
 * concurrent accepts of the same token can never both succeed; the loser rolls back with INVITE_USED.
 * The caller creates the session/cookie afterwards.
 */
export async function acceptInvite(input: AcceptInviteInput): Promise<UserRow> {
  const row = findInviteByToken(input.token);
  const v = classifyInvite(row);
  if (v.state === "invalid" || !row) throw new InviteError(404, "INVITE_INVALID");
  if (v.state === "used") throw new InviteError(410, "INVITE_USED");
  if (v.state === "expired") throw new InviteError(410, "INVITE_EXPIRED");

  const username = normalizeUsername(input.username);
  const displayName = input.displayName.trim();
  if (!USERNAME_RE.test(username)) throw new InviteError(400, "BAD_USERNAME");
  if (!displayName) throw new InviteError(400, "BAD_DISPLAY_NAME");
  if (!isPasswordAcceptable(input.password)) throw new InviteError(400, "WEAK_PASSWORD");
  if (!isUsernameAvailable(username)) throw new InviteError(409, "USERNAME_TAKEN", { suggestions: usernameSuggestions(username, displayName) });

  const passwordHash = await hashPassword(input.password);
  const db = getDb();
  try {
    return db.transaction((tx) => {
      const now = new Date();
      const user = tx
        .insert(schema.users)
        .values({ username, displayName, passwordHash, avatarColor: avatarColorFor(username), role: "member", onboarded: false })
        .returning()
        .get();
      const consumed = tx
        .update(schema.invites)
        .set({ useCount: sql`${schema.invites.useCount} + 1`, usedBy: user.id, usedAt: now, token: sql`CASE WHEN ${schema.invites.maxUses} IS NULL THEN ${schema.invites.token} ELSE NULL END` })
        .where(
          and(
            eq(schema.invites.id, row.id),
            isNull(schema.invites.revokedAt),
            gt(schema.invites.expiresAt, now),
            or(isNull(schema.invites.maxUses), lt(schema.invites.useCount, schema.invites.maxUses)),
          ),
        )
        .run();
      // 0 rows = another request consumed it between our classify() and this statement → roll back the user insert
      if (consumed.changes === 0) throw new InviteError(410, "INVITE_USED");
      tx.insert(schema.activityLog).values({ userId: user.id, kind: "join", text: copy.activity.join(displayName, username) }).run();
      tx.insert(schema.notifications).values({ userId: row.createdBy, type: "member_joined", title: copy.activity.memberJoined(displayName) }).run();
      return user;
    });
  } catch (err) {
    if (err instanceof InviteError) throw err;
    // unique(username) race between availability check and insert
    if (err instanceof Error && /UNIQUE/.test(err.message)) throw new InviteError(409, "USERNAME_TAKEN", { suggestions: usernameSuggestions(username, displayName) });
    throw err;
  }
}
