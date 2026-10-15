import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/sqlite-client";
import { getEnv } from "@/lib/config/env";

/** Per-user preferences stored as key/value rows; validated here so routes stay thin. */
export const userSettingsSchema = z.object({
  quality: z.enum(["1080p", "2160p"]),
  prefer_small: z.boolean(),
  autoplay_next: z.boolean(),
  ask_resume: z.boolean(),
  handoff_app: z.enum(["auto", "stremio", "infuse", "vlc"]),
  sub_lang: z.enum(["vi", "en", "off"]),
  sub_size: z.enum(["S", "M", "L"]),
  auto_translate: z.boolean(),
  show_4k: z.boolean(),
});
export type UserSettings = z.infer<typeof userSettingsSchema>;
export const userSettingsPatchSchema = userSettingsSchema.partial();

export function defaultUserSettings(): UserSettings {
  // auto_translate OFF by default: a paid AI job never starts without an explicit choice (onboarding step 2 / settings)
  return { quality: getEnv().DEFAULT_QUALITY, prefer_small: false, autoplay_next: true, ask_resume: true, handoff_app: "auto", sub_lang: "vi", sub_size: "M", auto_translate: false, show_4k: false };
}

export function getUserSettings(userId: number): UserSettings {
  const rows = getDb().select().from(schema.userSettings).where(eq(schema.userSettings.userId, userId)).all();
  const merged: Record<string, unknown> = { ...defaultUserSettings() };
  for (const r of rows) {
    try {
      merged[r.key] = JSON.parse(r.value);
    } catch {
      /* ignore corrupt row; default stays */
    }
  }
  const parsed = userSettingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : defaultUserSettings();
}

export function setUserSettings(userId: number, patch: Partial<UserSettings>): UserSettings {
  const db = getDb();
  db.transaction((tx) => {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      tx.insert(schema.userSettings)
        .values({ userId, key, value: JSON.stringify(value) })
        .onConflictDoUpdate({ target: [schema.userSettings.userId, schema.userSettings.key], set: { value: JSON.stringify(value) } })
        .run();
    }
  });
  return getUserSettings(userId);
}
