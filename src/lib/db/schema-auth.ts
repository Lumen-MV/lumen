import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";
import { bool, now, ts } from "./schema-helpers";

/** Account, session, invite, device, settings, activity and notification tables (Phase 1 owners). */

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  avatarColor: text("avatar_color").notNull().default("#2d6cdf"),
  role: text("role", { enum: ["admin", "member"] }).notNull().default("member"),
  disabled: bool("disabled").notNull().default(false),
  mustChangePassword: bool("must_change_password").notNull().default(false),
  /** when the admin issued the current temp password; a temp password older than TEMP_PASSWORD_TTL_MS is refused at login */
  passwordResetAt: ts("password_reset_at"),
  onboarded: bool("onboarded").notNull().default(false),
  lastSeenAt: ts("last_seen_at"),
  createdAt: ts("created_at").notNull().$defaultFn(now),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  deviceLabel: text("device_label").notNull().default(""),
  userAgent: text("user_agent").notNull().default(""),
  ip: text("ip").notNull().default(""),
  remember: bool("remember").notNull().default(true),
  createdAt: ts("created_at").notNull().$defaultFn(now),
  lastSeenAt: ts("last_seen_at").notNull().$defaultFn(now),
});

export const invites = sqliteTable("invites", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tokenHash: text("token_hash").notNull().unique(),
  note: text("note").notNull().default(""),
  createdBy: integer("created_by").notNull().references(() => users.id),
  expiresAt: ts("expires_at").notNull(),
  maxUses: integer("max_uses").default(1),
  useCount: integer("use_count").notNull().default(0),
  usedBy: integer("used_by").references(() => users.id, { onDelete: "set null" }),
  usedAt: ts("used_at"),
  revokedAt: ts("revoked_at"),
  createdAt: ts("created_at").notNull().$defaultFn(now),
  /** raw token kept only while the invite is still usable, so the admin "Link mời" table can show / copy it (Phase 6); cleared on use / revoke */
  token: text("token"),
});

/** Stremio manifest capability tokens, stored raw (not hashed) so Settings can re-display the URL. */
export const deviceTokens = sqliteTable("device_tokens", {
  token: text("token").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  label: text("label").notNull().default(""),
  createdAt: ts("created_at").notNull().$defaultFn(now),
  revokedAt: ts("revoked_at"),
  /** last Stremio request with this token (throttled to once a minute) — "Phiên đăng nhập" row + admin devices column */
  lastUsedAt: ts("last_used_at"),
});

export const userSettings = sqliteTable(
  "user_settings",
  {
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const activityLog = sqliteTable("activity_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  kind: text("kind", { enum: ["login", "join", "invite", "view", "cloud", "translate", "admin"] }).notNull(),
  text: text("text").notNull(),
  createdAt: ts("created_at").notNull().$defaultFn(now),
});

export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["cloud_ready", "subtitle_ready", "new_episode", "member_joined", "title_request"] }).notNull(),
  title: text("title").notNull(),
  mediaType: text("media_type"),
  tmdbId: integer("tmdb_id"),
  season: integer("season"),
  episode: integer("episode"),
  read: bool("read").notNull().default(false),
  createdAt: ts("created_at").notNull().$defaultFn(now),
});
