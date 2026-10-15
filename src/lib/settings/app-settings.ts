import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/sqlite-client";

/** Global key/value `settings` table (OS quota, AI month cost, …). Values are stored as JSON strings. */
export function getSetting<T>(key: string, fallback: T): T {
  const row = getDb().select().from(schema.settings).where(eq(schema.settings.key, key)).get();
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export function setSetting(key: string, value: unknown): void {
  getDb().insert(schema.settings).values({ key, value: JSON.stringify(value) }).onConflictDoUpdate({ target: schema.settings.key, set: { value: JSON.stringify(value) } }).run();
}

export function deleteSetting(key: string): void {
  getDb().delete(schema.settings).where(eq(schema.settings.key, key)).run();
}

/** `settings[key] += delta` for numeric counters (ai_month_cost_vnd); returns the new value. */
export function incrementSetting(key: string, delta: number): number {
  const next = getSetting<number>(key, 0) + delta;
  setSetting(key, next);
  return next;
}
