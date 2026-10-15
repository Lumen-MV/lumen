import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/sqlite-client";
import { formatMediaKey, type MediaKey } from "./media-key";

/** my_list / likes membership for a user (title-level: season/episode ignored). */
export type UserMediaFlags = { saved: Set<string>; liked: Set<string> };

export function getUserMediaFlags(userId: number, keys: Array<Pick<MediaKey, "type" | "tmdbId">>): UserMediaFlags {
  const flags: UserMediaFlags = { saved: new Set(), liked: new Set() };
  const ids = [...new Set(keys.map((k) => k.tmdbId))];
  if (!ids.length) return flags;
  const db = getDb();
  for (const r of db.select().from(schema.myList).where(and(eq(schema.myList.userId, userId), inArray(schema.myList.tmdbId, ids))).all()) {
    flags.saved.add(formatMediaKey(r.mediaType as MediaKey["type"], r.tmdbId));
  }
  for (const r of db.select().from(schema.likes).where(and(eq(schema.likes.userId, userId), inArray(schema.likes.tmdbId, ids))).all()) {
    flags.liked.add(formatMediaKey(r.mediaType as MediaKey["type"], r.tmdbId));
  }
  return flags;
}

/** Stamps `saved` / `liked` on a list of cards for the viewer (one query per table, title-level). */
export function withUserFlags<T extends { mediaKey: string; type: MediaKey["type"]; tmdbId: number }>(userId: number, items: T[]): Array<T & { saved: boolean; liked: boolean }> {
  const flags = getUserMediaFlags(userId, items);
  return items.map((it) => ({ ...it, saved: flags.saved.has(it.mediaKey), liked: flags.liked.has(it.mediaKey) }));
}

export function setMyList(userId: number, key: MediaKey, saved: boolean): boolean {
  const db = getDb();
  if (saved) db.insert(schema.myList).values({ userId, mediaType: key.type, tmdbId: key.tmdbId }).onConflictDoNothing().run();
  else db.delete(schema.myList).where(and(eq(schema.myList.userId, userId), eq(schema.myList.mediaType, key.type), eq(schema.myList.tmdbId, key.tmdbId))).run();
  return saved;
}

export function setLike(userId: number, key: MediaKey, liked: boolean): boolean {
  const db = getDb();
  if (liked) db.insert(schema.likes).values({ userId, mediaType: key.type, tmdbId: key.tmdbId }).onConflictDoNothing().run();
  else db.delete(schema.likes).where(and(eq(schema.likes.userId, userId), eq(schema.likes.mediaType, key.type), eq(schema.likes.tmdbId, key.tmdbId))).run();
  return liked;
}

/** Titles the user has interacted with (likes ∪ my_list ∪ progress), newest first, capped — seeds for "Dành riêng cho bạn". */
export function getUserTasteSeeds(userId: number, limit = 20): MediaKey[] {
  const db = getDb();
  const seen = new Set<string>();
  const out: MediaKey[] = [];
  const push = (type: string, tmdbId: number) => {
    const k = formatMediaKey(type as MediaKey["type"], tmdbId);
    if (seen.has(k) || out.length >= limit) return;
    seen.add(k);
    out.push({ type: type as MediaKey["type"], tmdbId });
  };
  for (const r of db.select().from(schema.likes).where(eq(schema.likes.userId, userId)).all()) push(r.mediaType, r.tmdbId);
  for (const r of db.select().from(schema.myList).where(eq(schema.myList.userId, userId)).all()) push(r.mediaType, r.tmdbId);
  for (const r of db.select().from(schema.progress).where(eq(schema.progress.userId, userId)).all()) push(r.mediaType, r.tmdbId);
  return out;
}

export function countMembers(): number {
  return getDb().select({ id: schema.users.id }).from(schema.users).all().length;
}
