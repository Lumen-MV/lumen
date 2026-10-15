import "server-only";
import { createMemoryCacheStore } from "@/lib/tmdb/memory-cache-store";
import { requestDownloadLink } from "./torbox-client";

/** `requestdl` answers are reused for 50 min per (torrent, file, viewer ip) — StremThru's proven window, below TorBox's ~1 h. */
export const LINK_TTL_MS = 50 * 60_000;
/** Both maps live on globalThis so a dev recompile never drops the links while the per-torrent flag survives. */
const g = globalThis as unknown as { __hcLinkStore?: ReturnType<typeof createMemoryCacheStore>; __hcLinkExpiry?: Map<number, number> };
const store = g.__hcLinkStore ??= createMemoryCacheStore(500, LINK_TTL_MS);
/** torrentId → newest link expiry: lets the picker keep "▶ Phát" enabled on rows playable without TorBox (outage). */
const expiry = (): Map<number, number> => (g.__hcLinkExpiry ??= new Map());

/** `refresh` (link-expired relink) skips the cached answer and calls `requestdl` again, overwriting it. */
export async function getCdnLink(torrentId: number, fileId: number, userIp: string | undefined, now = Date.now(), refresh = false): Promise<string> {
  const key = `${torrentId}:${fileId}:${userIp ?? "-"}`;
  const hit = refresh ? null : store.read<string>(key);
  if (hit) return hit.data;
  const url = await requestDownloadLink(torrentId, fileId, userIp);
  if (typeof url !== "string" || !/^https?:\/\//.test(url)) throw new Error("TorBox requestdl returned no URL");
  store.write(key, url);
  expiry().set(torrentId, now + LINK_TTL_MS);
  return url;
}

/** True while at least one `requestdl` answer for this torrent is still inside the 50-min window. */
export function hasCachedLink(torrentId: number, now = Date.now()): boolean {
  const until = expiry().get(torrentId);
  if (until === undefined) return false;
  if (until <= now) {
    expiry().delete(torrentId);
    return false;
  }
  return true;
}

/** A torrent TorBox no longer has: its links are dead too. */
export function forgetLinks(torrentId: number): void {
  expiry().delete(torrentId);
}
