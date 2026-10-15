import { and, count, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/sqlite-client";

/** Unread badge count for the header bell (notification list UI lands in Phase 2). */
export function countUnreadNotifications(userId: number): number {
  const row = getDb()
    .select({ n: count() })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.userId, userId), eq(schema.notifications.read, false)))
    .get();
  return row?.n ?? 0;
}
