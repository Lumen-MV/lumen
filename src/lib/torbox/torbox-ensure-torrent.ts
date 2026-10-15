import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/sqlite-client";
import { isTorrentFinished } from "@/lib/cloud/cloud-job-state-machine";
import { createTorrent, getTorrent, TorboxError } from "./torbox-client";
import { forgetLinks } from "./torbox-link-cache";
import { buildMagnet } from "./torbox-pick-video-file";
import type { TorboxFile } from "./torbox-types";

/**
 * Makes sure a cached hash exists in the TorBox account and returns its id + file list, remembering it in `torrent_cache`.
 * `add_only_if_cached=true` so an uncached hash never starts a download here (that is the cloud-job path).
 */
export type EnsuredTorrent = { torrentId: number; files: TorboxFile[] };
export class NotCachedError extends Error {
  constructor(public readonly hash: string) {
    super(`hash ${hash} is not cached on TorBox`);
    this.name = "NotCachedError";
  }
}

const NOT_CACHED_RE = /not.*cached|no cached|cache/i;
const TORRENT_CACHE_MAX_AGE_MS = 24 * 3_600_000;

export function readTorrentCache(hash: string): EnsuredTorrent | null {
  const row = getDb().select().from(schema.torrentCache).where(eq(schema.torrentCache.hash, hash)).get();
  if (!row?.torboxTorrentId || Date.now() - row.updatedAt.getTime() > TORRENT_CACHE_MAX_AGE_MS) return null;
  try {
    const files = JSON.parse(row.filesJson) as TorboxFile[];
    return Array.isArray(files) && files.length ? { torrentId: row.torboxTorrentId, files } : null;
  } catch {
    return null;
  }
}

export function writeTorrentCache(hash: string, torrentId: number, files: TorboxFile[], state: string): void {
  const slim = files.map((f) => ({ id: f.id, name: f.name, short_name: f.short_name, size: f.size, mimetype: f.mimetype }));
  getDb()
    .insert(schema.torrentCache)
    .values({ hash, torboxTorrentId: torrentId, filesJson: JSON.stringify(slim), state, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.torrentCache.hash, set: { torboxTorrentId: torrentId, filesJson: JSON.stringify(slim), state, updatedAt: new Date() } })
    .run();
}

/** Forget a torrent TorBox no longer has (cancelled job, expired by inactivity, 404 on requestdl) — resolve re-adds it next time. */
export function dropTorrentCache(hash: string): void {
  const row = getDb().select({ id: schema.torrentCache.torboxTorrentId }).from(schema.torrentCache).where(eq(schema.torrentCache.hash, hash)).get();
  if (row?.id) forgetLinks(row.id);
  getDb().delete(schema.torrentCache).where(eq(schema.torrentCache.hash, hash)).run();
}

/** Throws NotCachedError (→ 409), TorboxError (→ 503) or Error (no files). */
export async function ensureCachedTorrent(hash: string, name?: string, sources?: string[]): Promise<EnsuredTorrent> {
  const known = readTorrentCache(hash);
  if (known) return known;
  let created;
  try {
    created = await createTorrent(buildMagnet(hash, name, sources), { addOnlyIfCached: true });
  } catch (err) {
    if (err instanceof TorboxError && err.status < 500 && err.status !== 429 && NOT_CACHED_RE.test(err.detail)) throw new NotCachedError(hash);
    throw err;
  }
  if (!created?.torrent_id) throw new NotCachedError(hash);
  const t = await getTorrent(created.torrent_id);
  if (!t || !isTorrentFinished(t) || !t.files?.length) {
    // "found cached" but not yet listed as finished → treat as not cached rather than starting a download
    throw new NotCachedError(hash);
  }
  writeTorrentCache(hash, t.id, t.files, t.download_state);
  return { torrentId: t.id, files: t.files };
}
