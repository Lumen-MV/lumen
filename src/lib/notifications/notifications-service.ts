import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/sqlite-client";
import { copy } from "@/lib/copy-vi";
import { formatRelativeVi } from "@/lib/format/time-format";
import { mediaHref, type MediaType } from "@/lib/catalog/media-key";

/** Notification rows → dropdown items (`html` keeps the mockup's <b> markers, rendered via renderBold, never innerHTML). */
export type NotificationItem = { id: number; type: NotificationRow["type"]; icon: string; html: string; timeAgo: string; href: string; read: boolean };
type NotificationRow = typeof schema.notifications.$inferSelect;
type Role = "admin" | "member";
const LIST_LIMIT = 30;

function toItem(r: NotificationRow, now: Date, role: Role): NotificationItem {
  const n = copy.notif;
  const type = (r.mediaType === "tv" ? "tv" : "movie") as MediaType;
  const titleHref = r.tmdbId ? mediaHref(type, r.tmdbId, r.season ?? undefined) : "/";
  const byType = {
    cloud_ready: { icon: n.icons.cloudReady, html: n.cloudReady(r.title), href: titleHref },
    subtitle_ready: { icon: n.icons.subReady, html: n.subReady(r.title), href: titleHref },
    new_episode: { icon: n.icons.newEp, html: n.newEp(r.title, r.season ?? 0, r.episode ?? 0), href: titleHref },
    // any inviter gets this row (accept-invite writes to the invite's creator); only admins may open /admin
    member_joined: { icon: n.icons.joined, html: n.joined(r.title), href: role === "admin" ? "/admin" : "/settings" },
    // "Yêu cầu thêm phim" from the empty source picker: `title` already carries the rendered "<b>name</b> yêu cầu thêm “…”" text
    title_request: { icon: copy.admin.requestIcon, html: r.title, href: titleHref },
  }[r.type];
  return { id: r.id, type: r.type, ...byType, timeAgo: formatRelativeVi(r.createdAt, now), read: r.read };
}

export function listNotifications(userId: number, role: Role): { items: NotificationItem[]; unread: number } {
  const rows = getDb().select().from(schema.notifications).where(eq(schema.notifications.userId, userId)).orderBy(desc(schema.notifications.createdAt), desc(schema.notifications.id)).limit(LIST_LIMIT).all();
  const now = new Date();
  const items = rows.map((r) => toItem(r, now, role));
  return { items, unread: items.filter((i) => !i.read).length };
}

/** `id` → that row (must belong to the user); `all` → every unread row of the user. Returns remaining unread count. */
export function markNotificationsRead(userId: number, target: { all: true } | { id: number }): number {
  const db = getDb();
  const own = eq(schema.notifications.userId, userId);
  if ("all" in target) db.update(schema.notifications).set({ read: true }).where(own).run();
  else db.update(schema.notifications).set({ read: true }).where(and(own, eq(schema.notifications.id, target.id))).run();
  return db.select().from(schema.notifications).where(and(own, eq(schema.notifications.read, false))).all().length;
}
