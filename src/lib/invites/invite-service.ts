import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/sqlite-client";
import { getEnv } from "@/lib/config/env";
import { generateToken, hashToken, looksLikeToken } from "@/lib/auth/invite-token";
import { daysBetweenCeil, DAY_MS } from "@/lib/format/time-format";

export type InviteState = "valid" | "used" | "expired" | "invalid";
export type InviteValidation =
  | { state: "valid"; inviterName: string; daysLeft: number }
  | { state: "used"; usedBy: string; usedAt: string }
  | { state: "expired"; expiredDaysAgo: number }
  | { state: "invalid" };

export type InviteRow = typeof schema.invites.$inferSelect;
type InviteStateInput = Pick<InviteRow, "revokedAt" | "maxUses" | "useCount" | "expiresAt">;

export function inviteUrl(token: string): string {
  return `${getEnv().APP_URL}/invite/${token}`;
}

/** Admin creates a hashed, single-use (default) invite; the raw token only exists in the returned URL. */
export function createInvite(input: { createdBy: number; note?: string; expiresDays?: 3 | 7 | 14; maxUses?: 1 | null }) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + (input.expiresDays ?? 7) * DAY_MS);
  const row = getDb()
    .insert(schema.invites)
    .values({ tokenHash: hashToken(token), token, note: input.note ?? "", createdBy: input.createdBy, expiresAt, maxUses: input.maxUses === undefined ? 1 : input.maxUses })
    .returning()
    .get();
  return { id: row.id, token, url: inviteUrl(token), expiresAt: expiresAt.toISOString() };
}

export function findInviteByToken(token: string): InviteRow | undefined {
  if (!looksLikeToken(token)) return undefined;
  return getDb().select().from(schema.invites).where(eq(schema.invites.tokenHash, hashToken(token))).get();
}

function displayNameOf(userId: number | null): string {
  if (userId == null) return "";
  return getDb().select({ displayName: schema.users.displayName }).from(schema.users).where(eq(schema.users.id, userId)).get()?.displayName ?? "";
}

function usernameOf(userId: number | null): string {
  if (userId == null) return "";
  return getDb().select({ username: schema.users.username }).from(schema.users).where(eq(schema.users.id, userId)).get()?.username ?? "";
}

/** Pure state check (no DB). Order matters: invalid → used → expired → valid. */
export function inviteState(row: InviteStateInput | undefined, now = new Date()): InviteState {
  if (!row || row.revokedAt) return "invalid";
  if (row.maxUses != null && row.useCount >= row.maxUses) return "used";
  if (row.expiresAt.getTime() <= now.getTime()) return "expired";
  return "valid";
}

/** The 4 states shown by /invite/[token], with the names the page needs (one extra lookup at most). */
export function classifyInvite(row: InviteRow | undefined, now = new Date()): InviteValidation {
  const state = inviteState(row, now);
  if (!row || state === "invalid") return { state: "invalid" };
  if (state === "used") return { state, usedBy: usernameOf(row.usedBy), usedAt: (row.usedAt ?? now).toISOString() };
  if (state === "expired") return { state, expiredDaysAgo: Math.max(1, Math.floor((now.getTime() - row.expiresAt.getTime()) / DAY_MS)) };
  return { state, inviterName: displayNameOf(row.createdBy), daysLeft: Math.max(1, daysBetweenCeil(now, row.expiresAt)) };
}

export function validateInvite(token: string): InviteValidation {
  return classifyInvite(findInviteByToken(token));
}

/** `https://phim.example.com/invite/k3Jd…Qw` — the admin table never shows the whole token. */
export const maskInviteUrl = (url: string): string => url.replace(/\/invite\/([A-Za-z0-9_-]{32})$/, (_, t: string) => `/invite/${t.slice(0, 4)}…${t.slice(-2)}`);

/**
 * Admin list: invites LEFT JOIN users (consumer's display name) + creator name. The raw token only rides along while the
 * invite is still valid (copy button); it is cleared the moment it is used / revoked, and never exposed otherwise.
 */
export function listInvites() {
  const now = new Date();
  const creators = new Map(getDb().select({ id: schema.users.id, displayName: schema.users.displayName }).from(schema.users).all().map((u) => [u.id, u.displayName]));
  return getDb()
    .select({
      id: schema.invites.id,
      note: schema.invites.note,
      createdBy: schema.invites.createdBy,
      expiresAt: schema.invites.expiresAt,
      maxUses: schema.invites.maxUses,
      useCount: schema.invites.useCount,
      usedBy: schema.invites.usedBy,
      usedAt: schema.invites.usedAt,
      revokedAt: schema.invites.revokedAt,
      createdAt: schema.invites.createdAt,
      rawToken: schema.invites.token,
      usedByName: schema.users.displayName,
    })
    .from(schema.invites)
    .leftJoin(schema.users, eq(schema.invites.usedBy, schema.users.id))
    .orderBy(desc(schema.invites.createdAt))
    .all()
    .map(({ rawToken, ...r }) => {
      const state = inviteState(r, now);
      const url = state === "valid" && rawToken ? inviteUrl(rawToken) : null;
      return { ...r, usedByName: r.usedByName ?? "", createdByName: creators.get(r.createdBy) ?? "", state, url, maskedUrl: url ? maskInviteUrl(url) : null };
    });
}

/** "Huỷ": a valid invite stops working immediately (its raw token is dropped as well). */
export function revokeInvite(id: number, now = new Date()): InviteRow | null {
  const row = getDb().select().from(schema.invites).where(eq(schema.invites.id, id)).get();
  if (!row) return null;
  if (!row.revokedAt) getDb().update(schema.invites).set({ revokedAt: now, token: null }).where(eq(schema.invites.id, id)).run();
  return getDb().select().from(schema.invites).where(eq(schema.invites.id, id)).get() ?? null;
}

/** "Tạo lại": a fresh 7-day invite with the same note / uses, created by the acting admin. Refused (`STILL_VALID`) while the old one still works. */
export function recreateInvite(id: number, createdBy: number, now = new Date()) {
  const row = getDb().select().from(schema.invites).where(eq(schema.invites.id, id)).get();
  if (!row) return null;
  if (inviteState(row, now) === "valid") return "STILL_VALID" as const;
  const maxUses = row.maxUses === null ? null : 1;
  return { ...createInvite({ createdBy, note: row.note, expiresDays: 7, maxUses }), note: row.note, maxUses };
}
