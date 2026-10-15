import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/sqlite-client";

/** One notification row per active admin (title requests). Never throws — a failed notification must not fail the request. */
export function notifyAdmins(values: Omit<typeof schema.notifications.$inferInsert, "userId">): number {
  try {
    const db = getDb();
    const admins = db.select({ id: schema.users.id }).from(schema.users).where(and(eq(schema.users.role, "admin"), eq(schema.users.disabled, false))).all();
    if (!admins.length) return 0;
    db.insert(schema.notifications).values(admins.map((a) => ({ ...values, userId: a.id }))).run();
    return admins.length;
  } catch (err) {
    console.error("[notify-admins]", err instanceof Error ? err.message : err);
    return 0;
  }
}
