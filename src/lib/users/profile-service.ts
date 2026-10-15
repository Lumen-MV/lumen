import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/sqlite-client";
import { isPasswordAcceptable } from "@/lib/auth/password-strength";
import { deleteOtherSessions } from "@/lib/auth/session-service";
import { AVATAR_SWATCHES } from "./avatar-swatches";
import { hashPassword, toPublicUser, verifyPassword, type PublicUser } from "./user-service";

/** Settings → Hồ sơ: display name + avatar swatch (PATCH /api/me/profile) and the change-password form (POST /api/me/password). */

export const profilePatchSchema = z.object({ displayName: z.string().trim().min(1).max(40).optional(), avatarColor: z.enum(AVATAR_SWATCHES).optional() }).refine((p) => p.displayName !== undefined || p.avatarColor !== undefined, { message: "empty patch" });
export type ProfilePatch = z.infer<typeof profilePatchSchema>;

export function updateProfile(userId: number, patch: ProfilePatch): PublicUser {
  const db = getDb();
  const set: Partial<typeof schema.users.$inferInsert> = {};
  if (patch.displayName !== undefined) set.displayName = patch.displayName;
  if (patch.avatarColor !== undefined) set.avatarColor = patch.avatarColor;
  db.update(schema.users).set(set).where(eq(schema.users.id, userId)).run();
  return toPublicUser(db.select().from(schema.users).where(eq(schema.users.id, userId)).get()!);
}

export type PasswordChangeResult = "ok" | "PW_WRONG" | "WEAK_PASSWORD" | "NOT_FOUND";

/**
 * Verifies the current password, stores the new hash, clears `must_change_password` + its issue time (temp password flow)
 * and logs every other device out (`keepSessionId` = the caller's own session survives).
 */
export async function changePassword(userId: number, current: string, next: string, keepSessionId?: string): Promise<PasswordChangeResult> {
  const db = getDb();
  const user = db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
  if (!user) return "NOT_FOUND";
  if (!isPasswordAcceptable(next)) return "WEAK_PASSWORD";
  if (!(await verifyPassword(current, user.passwordHash))) return "PW_WRONG";
  db.update(schema.users).set({ passwordHash: await hashPassword(next), mustChangePassword: false, passwordResetAt: null }).where(eq(schema.users.id, userId)).run();
  if (keepSessionId) deleteOtherSessions(userId, keepSessionId);
  return "ok";
}
