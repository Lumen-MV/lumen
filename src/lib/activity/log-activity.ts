import { getDb, schema } from "@/lib/db/sqlite-client";

export type ActivityKind = (typeof schema.activityLog.$inferInsert)["kind"];

/** Appends one row to activity_log (admin "Nhật ký hoạt động" in Phase 6). Never throws. */
export function logActivity(kind: ActivityKind, text: string, userId: number | null = null): void {
  try {
    getDb().insert(schema.activityLog).values({ kind, text, userId }).run();
  } catch (err) {
    console.error("[activity] failed to log", kind, err);
  }
}
