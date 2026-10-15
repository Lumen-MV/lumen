import "server-only";
import { and, count, eq, gte, isNull } from "drizzle-orm";
import { copy } from "@/lib/copy-vi";
import { getDb, schema } from "@/lib/db/sqlite-client";
import { formatRelativeVi } from "@/lib/format/time-format";
import { getUserSettings } from "@/lib/users/user-settings";
import { monthStart } from "./admin-stats-service";
import { deviceSummary } from "./device-short-name";
import { titleLabel } from "./title-label";
import { liveViewRows } from "./watching-now";

/** GET /api/admin/users — one row per member for the "Thành viên" table (search / filter / sort are applied here). */
export type MemberStatus = "ok" | "off" | "wait";
export type MemberFilter = (typeof copy.admin.members.filterKeys)[number];
export type MemberRow = {
  id: number;
  displayName: string;
  username: string;
  role: "admin" | "member";
  lastActivity: { kind: "watching" | "ago" | "never"; text: string };
  viewsMonth: number;
  quality: string;
  devices: string;
  status: MemberStatus;
  hasStremio: boolean;
};

/** Pure classification: locked → off; never seen → wait; else ok. */
export function memberStatus(u: { disabled: boolean; lastSeenAt: Date | null }): MemberStatus {
  if (u.disabled) return "off";
  if (!u.lastSeenAt) return "wait";
  return "ok";
}

/** Pure filter + search + sort (views desc, then name) shared with the unit tests. */
export function filterMembers(rows: MemberRow[], q: string, filter: MemberFilter): MemberRow[] {
  const needle = q.trim().toLowerCase();
  const want: Record<MemberFilter, MemberStatus | null> = { all: null, active: "ok", locked: "off", pending: "wait" };
  return rows
    .filter((r) => (want[filter] === null || r.status === want[filter]) && (!needle || r.displayName.toLowerCase().includes(needle) || r.username.toLowerCase().includes(needle)))
    .sort((a, b) => b.viewsMonth - a.viewsMonth || a.displayName.localeCompare(b.displayName, "vi"));
}

export async function listMembers(now = new Date()): Promise<MemberRow[]> {
  const db = getDb();
  const users = db.select().from(schema.users).all();
  const sessions = db.select({ userId: schema.sessions.userId, deviceLabel: schema.sessions.deviceLabel }).from(schema.sessions).all();
  const tokens = new Set(db.select({ userId: schema.deviceTokens.userId }).from(schema.deviceTokens).where(isNull(schema.deviceTokens.revokedAt)).all().map((t) => t.userId));
  const views = new Map(db.select({ userId: schema.views.userId, n: count() }).from(schema.views).where(gte(schema.views.startedAt, monthStart(now))).groupBy(schema.views.userId).all().map((r) => [r.userId, r.n]));
  const live = new Map(liveViewRows(now).map((r) => [r.userId, r]));
  const m = copy.admin.members;
  return Promise.all(
    users.map(async (u) => {
      const watching = live.get(u.id);
      const lastActivity: MemberRow["lastActivity"] = watching
        ? { kind: "watching", text: m.watching(await titleLabel(watching.key)) }
        : u.lastSeenAt
          ? { kind: "ago", text: formatRelativeVi(u.lastSeenAt, now) }
          : { kind: "never", text: m.neverLoggedIn };
      const settings = getUserSettings(u.id);
      return {
        id: u.id,
        displayName: u.displayName,
        username: u.username,
        role: u.role,
        lastActivity,
        viewsMonth: views.get(u.id) ?? 0,
        quality: settings.quality === "2160p" ? copy.settings.playback.q[1] : copy.settings.playback.q[0],
        devices: deviceSummary(sessions.filter((s) => s.userId === u.id).map((s) => s.deviceLabel), tokens.has(u.id)),
        status: memberStatus(u),
        hasStremio: tokens.has(u.id),
      };
    }),
  );
}

export function countAdmins(): number {
  return getDb().select({ n: count() }).from(schema.users).where(and(eq(schema.users.role, "admin"), eq(schema.users.disabled, false))).get()?.n ?? 0;
}
