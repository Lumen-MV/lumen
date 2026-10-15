import "server-only";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/sqlite-client";
import { getEnv } from "@/lib/config/env";

import { USERNAME_RE, normalizeUsername, slugifyUsername } from "./username-rules";

export { USERNAME_RE, normalizeUsername, slugifyUsername };
const BCRYPT_COST = 10;
/** Valid cost-10 hash of a throwaway string: login compares against it when the username is unknown so timing does not reveal account existence. */
export const DUMMY_PASSWORD_HASH = "$2b$10$lxy1vEOBwuSdTvtTRVhGKOi83SjD.1aol7QYxNK9r9cJkCEehfN/G";
const AVATAR_COLORS = ["#2d6cdf", "#e50914", "#46d369", "#f59e0b", "#8e44ad", "#16a085"];

export type UserRow = typeof schema.users.$inferSelect;
export type PublicUser = { id: number; username: string; displayName: string; avatarColor: string; role: "admin" | "member"; onboarded: boolean; /** admin issued a temp password → settings opens with the "đổi mật khẩu" note */ mustChangePassword: boolean };

export function toPublicUser(u: UserRow): PublicUser {
  return { id: u.id, username: u.username, displayName: u.displayName, avatarColor: u.avatarColor, role: u.role, onboarded: u.onboarded, mustChangePassword: u.mustChangePassword };
}

export function findUserByUsername(username: string): UserRow | undefined {
  return getDb().select().from(schema.users).where(eq(schema.users.username, normalizeUsername(username))).get();
}

export function isUsernameAvailable(username: string): boolean {
  return !findUserByUsername(username);
}

/** `${u}2`, `${u}3`… plus a slug of the display name; only free names are returned. */
export function usernameSuggestions(username: string, displayName = ""): string[] {
  const u = normalizeUsername(username);
  const out: string[] = [];
  for (let n = 2; n < 6 && out.length < 1; n++) if (isUsernameAvailable(`${u}${n}`)) out.push(`${u}${n}`);
  const slug = slugifyUsername(displayName);
  if (slug.length >= 3 && slug !== u && isUsernameAvailable(slug)) out.push(slug);
  if (out.length < 2 && isUsernameAvailable(`${u}_${new Date().getFullYear() % 100}`)) out.push(`${u}_${new Date().getFullYear() % 100}`);
  return out;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export type NewUserInput = { username: string; displayName: string; password: string; role?: "admin" | "member"; onboarded?: boolean; disabled?: boolean; avatarColor?: string };

/** Deterministic avatar colour so the letter tile looks the same on every device. */
export function avatarColorFor(username: string): string {
  return AVATAR_COLORS[username.charCodeAt(0) % AVATAR_COLORS.length];
}

export async function createUser(input: NewUserInput): Promise<UserRow> {
  const username = normalizeUsername(input.username);
  if (!USERNAME_RE.test(username)) throw new Error("BAD_USERNAME");
  const passwordHash = await hashPassword(input.password);
  return getDb()
    .insert(schema.users)
    .values({ username, displayName: input.displayName.trim(), passwordHash, avatarColor: input.avatarColor ?? avatarColorFor(username), role: input.role ?? "member", onboarded: input.onboarded ?? false, disabled: input.disabled ?? false })
    .returning()
    .get();
}

/** `npm run seed -- --reset-password`: sets the env admin's password back to ADMIN_PASSWORD. */
export async function resetAdminPasswordFromEnv(): Promise<string> {
  const env = getEnv();
  const admin = findUserByUsername(env.ADMIN_USERNAME);
  if (!admin || admin.role !== "admin") throw new Error(`admin "${env.ADMIN_USERNAME}" not found`);
  getDb().update(schema.users).set({ passwordHash: await hashPassword(env.ADMIN_PASSWORD), disabled: false }).where(eq(schema.users.id, admin.id)).run();
  return admin.username;
}

/** Idempotent: creates the env admin when no admin exists (boot + `npm run seed`). */
export async function seedAdminFromEnv(): Promise<{ created: boolean; username: string }> {
  const env = getEnv();
  const existingAdmin = getDb().select({ id: schema.users.id, username: schema.users.username }).from(schema.users).where(eq(schema.users.role, "admin")).get();
  if (existingAdmin) return { created: false, username: existingAdmin.username };
  // admin keeps the mockup's blue avatar tile
  const user = await createUser({ username: env.ADMIN_USERNAME, displayName: env.ADMIN_DISPLAY_NAME, password: env.ADMIN_PASSWORD, role: "admin", onboarded: true, avatarColor: "#2d6cdf" });
  return { created: true, username: user.username };
}
