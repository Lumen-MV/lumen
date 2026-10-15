import "server-only";
import { eq } from "drizzle-orm";
import { logActivity } from "@/lib/activity/log-activity";
import { revokeDeviceTokens } from "@/lib/auth/device-token";
import { cancelUserJobs } from "@/lib/cloud/cloud-queue";
import { getEnv } from "@/lib/config/env";
import { copy } from "@/lib/copy-vi";
import { getDb, schema } from "@/lib/db/sqlite-client";
import { dropUserStreams } from "@/lib/play/stream-registry";
import { hashPassword, toPublicUser, type PublicUser, type UserRow } from "@/lib/users/user-service";
import { countAdmins } from "./admin-users-service";
import { generateTempPassword } from "./temp-password";

/**
 * Admin member actions (PATCH /api/admin/users, POST …/reset-password, DELETE …/[id]). Every action is refused for the
 * acting admin's own account and when it would leave the group without an active admin. Typed failures map to 4xx.
 */
export class AdminActionError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}
type Actor = { id: number; displayName: string };
const db = () => getDb();

export function getUserOrThrow(id: number): UserRow {
  const u = db().select().from(schema.users).where(eq(schema.users.id, id)).get();
  if (!u) throw new AdminActionError(404, "NOT_FOUND");
  return u;
}

function assertNotSelf(actor: Actor, target: UserRow): void {
  if (actor.id === target.id) throw new AdminActionError(409, "SELF");
}

function assertAnotherAdminRemains(target: UserRow): void {
  if (target.role === "admin" && !target.disabled && countAdmins() <= 1) throw new AdminActionError(409, "LAST_ADMIN");
}

/** Issues a temp password (`Gk7-mPx2-Q9w`), stamps its issue time (48 h validity) and forces a change at next login. */
async function issueTempPassword(id: number): Promise<string> {
  const tempPassword = generateTempPassword();
  db().update(schema.users).set({ passwordHash: await hashPassword(tempPassword), mustChangePassword: true, passwordResetAt: new Date() }).where(eq(schema.users.id, id)).run();
  return tempPassword;
}

/**
 * Lock: the member's queued / downloading cloud jobs are cancelled first (TorBox torrents removed, slots freed), then one
 * transaction sets `disabled` and deletes every session (immediate logout everywhere — Stremio stops too since the token
 * check reads `disabled`), and their live stream handles are dropped.
 */
export async function lockMember(actor: Actor, id: number): Promise<PublicUser> {
  const u = getUserOrThrow(id);
  assertNotSelf(actor, u);
  assertAnotherAdminRemains(u);
  await cancelUserJobs(id);
  db().transaction((tx) => {
    tx.update(schema.users).set({ disabled: true }).where(eq(schema.users.id, id)).run();
    tx.delete(schema.sessions).where(eq(schema.sessions.userId, id)).run();
  });
  dropUserStreams(id);
  logActivity("admin", copy.activity.locked(actor.displayName, u.displayName), actor.id);
  return toPublicUser(getUserOrThrow(id));
}

export function unlockMember(actor: Actor, id: number): PublicUser {
  const u = getUserOrThrow(id);
  db().update(schema.users).set({ disabled: false }).where(eq(schema.users.id, id)).run();
  logActivity("admin", copy.activity.unlocked(actor.displayName, u.displayName), actor.id);
  return toPublicUser(getUserOrThrow(id));
}

export function changeRole(actor: Actor, id: number, role: "admin" | "member"): PublicUser {
  const u = getUserOrThrow(id);
  assertNotSelf(actor, u);
  if (role === "member") assertAnotherAdminRemains(u);
  db().update(schema.users).set({ role }).where(eq(schema.users.id, id)).run();
  logActivity("admin", copy.activity.role(actor.displayName, u.displayName, role === "admin" ? copy.settings.profile.admin : copy.settings.profile.member), actor.id);
  return toPublicUser(getUserOrThrow(id));
}

/** ⋯ "Thu hồi link Stremio" for another member. */
export function revokeMemberStremio(actor: Actor, id: number): PublicUser {
  const u = getUserOrThrow(id);
  revokeDeviceTokens(id);
  logActivity("admin", `${actor.displayName}: ${copy.admin.members.revokedToast(u.displayName)}`, actor.id);
  return toPublicUser(u);
}

/** Temp password shown once; the member must change it at next login (48 h to do so). Sessions survive (locking is the admin's call). */
export async function resetMemberPassword(actor: Actor, id: number): Promise<{ user: PublicUser; tempPassword: string }> {
  const u = getUserOrThrow(id);
  assertNotSelf(actor, u);
  const tempPassword = await issueTempPassword(id);
  logActivity("admin", copy.activity.passwordReset(actor.displayName, u.displayName), actor.id);
  return { user: toPublicUser(getUserOrThrow(id)), tempPassword };
}

/**
 * "Gửi lại link" — only for a member who never logged in (409 ALREADY_ACTIVE otherwise): the account keeps its username,
 * gets a fresh temp password and the admin receives the login link + temp password to pass on (shown once).
 */
export async function resendLogin(actor: Actor, id: number): Promise<{ user: PublicUser; tempPassword: string; loginUrl: string }> {
  const u = getUserOrThrow(id);
  assertNotSelf(actor, u);
  if (u.lastSeenAt) throw new AdminActionError(409, "ALREADY_ACTIVE");
  const tempPassword = await issueTempPassword(id);
  logActivity("admin", copy.activity.passwordReset(actor.displayName, u.displayName), actor.id);
  return { user: toPublicUser(getUserOrThrow(id)), tempPassword, loginUrl: `${getEnv().APP_URL.replace(/\/$/, "")}/login` };
}

/**
 * Typed-confirm delete: active cloud jobs are cancelled first, then one transaction re-parents the invites the member
 * created to the actor and deletes the user (FK cascade: sessions, tokens, settings, notifications, likes, my_list,
 * progress, views, jobs, subtitle prefs); live stream handles are dropped afterwards.
 */
export async function deleteMember(actor: Actor, id: number, confirmUsername: string): Promise<void> {
  const u = getUserOrThrow(id);
  assertNotSelf(actor, u);
  assertAnotherAdminRemains(u);
  if (confirmUsername !== u.username) throw new AdminActionError(400, "CONFIRM_MISMATCH");
  await cancelUserJobs(id);
  db().transaction((tx) => {
    tx.update(schema.invites).set({ createdBy: actor.id }).where(eq(schema.invites.createdBy, id)).run();
    tx.delete(schema.users).where(eq(schema.users.id, id)).run();
  });
  dropUserStreams(id);
  logActivity("admin", copy.activity.deleted(actor.displayName, u.displayName), actor.id);
}
