import "server-only";
import { and, eq } from "drizzle-orm";
import { formatMediaKey, type MediaKey } from "@/lib/catalog/media-key";
import { getDb, schema } from "@/lib/db/sqlite-client";
import { shortContainer } from "./release-labels";
import type { Release } from "./sources-types";

/** `release_prefs` access — one remembered release per viewer × TITLE (`movie:<id>` / `tv:<id>`), see release-pref-select.ts. */
export type ReleasePrefRow = typeof schema.releasePrefs.$inferSelect;

/** Prefs live at title level: an episode key `tv:66732:4:1` is stored (and looked up) under `tv:66732`. */
export const titleKeyOf = (key: MediaKey): string => formatMediaKey(key.type, key.tmdbId);

const where = (userId: number, mediaKey: string) => and(eq(schema.releasePrefs.userId, userId), eq(schema.releasePrefs.mediaKey, mediaKey));

export function getReleasePref(userId: number, mediaKey: string): ReleasePrefRow | null {
  return getDb().select().from(schema.releasePrefs).where(where(userId, mediaKey)).get() ?? null;
}

/** Explicit pick in the picker: upsert the title's pref from the chosen row (`key` may be an episode key). */
export function upsertReleasePref(userId: number, key: MediaKey, release: Release, now = new Date()): ReleasePrefRow {
  const mediaKey = titleKeyOf(key);
  const set = {
    hash: release.hash.toLowerCase(),
    fileId: null,
    label: `${release.qualityLabel} ${shortContainer(release.parsed)} · ${release.sizeLabel} · ${release.parsed.group}`.trim(),
    quality: release.qualityLabel,
    releaseGroup: release.parsed.group,
    playClass: release.playClass,
    episodeMediaKey: key.episode !== undefined ? formatMediaKey(key.type, key.tmdbId, key.season, key.episode) : null,
    chosenAt: now,
  };
  getDb()
    .insert(schema.releasePrefs)
    .values({ userId, mediaKey, ...set })
    .onConflictDoUpdate({ target: [schema.releasePrefs.userId, schema.releasePrefs.mediaKey], set })
    .run();
  return getReleasePref(userId, mediaKey)!;
}

/** "Quên lựa chọn" → true when a row was removed. */
export function deleteReleasePref(userId: number, mediaKey: string): boolean {
  return getDb().delete(schema.releasePrefs).where(where(userId, mediaKey)).run().changes > 0;
}
