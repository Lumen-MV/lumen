import "server-only";
import { and, desc, eq, gte, inArray, lt, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/sqlite-client";
import { activityTimeLabel, boldActorName, kindsForFilter, monthWindow, type ActivityEntry, type ActivityFilter } from "./activity-filter-rules";

/** GET /api/admin/activity(.csv)?kind=&userId=&month= — newest first, capped. */
export const ACTIVITY_LIMIT = 300;
export type ActivityQuery = { filter: ActivityFilter; userId: number | null; month: string | null; limit?: number };

export function listActivity(q: ActivityQuery, now = new Date()): ActivityEntry[] {
  const where: SQL[] = [];
  const kinds = kindsForFilter(q.filter);
  if (kinds) where.push(inArray(schema.activityLog.kind, kinds));
  if (q.userId !== null) where.push(eq(schema.activityLog.userId, q.userId));
  const win = monthWindow(q.month);
  if (win) where.push(gte(schema.activityLog.createdAt, win.from), lt(schema.activityLog.createdAt, win.to));
  const rows = getDb()
    .select({ id: schema.activityLog.id, kind: schema.activityLog.kind, userId: schema.activityLog.userId, text: schema.activityLog.text, createdAt: schema.activityLog.createdAt, userName: schema.users.displayName })
    .from(schema.activityLog)
    .leftJoin(schema.users, eq(schema.activityLog.userId, schema.users.id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(schema.activityLog.createdAt), desc(schema.activityLog.id))
    .limit(q.limit ?? ACTIVITY_LIMIT)
    .all();
  return rows.map((r) => ({ id: r.id, kind: r.kind, userId: r.userId, userName: r.userName ?? "", time: activityTimeLabel(r.createdAt, now), html: boldActorName(r.text, r.userName ?? ""), createdAt: r.createdAt.toISOString() }));
}

/** "Người: … ▾" menu entries. */
export function activityPeople(): Array<{ id: number; name: string }> {
  return getDb().select({ id: schema.users.id, name: schema.users.displayName }).from(schema.users).orderBy(schema.users.displayName).all();
}
