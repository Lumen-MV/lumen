import "server-only";
import { isTorrentGone } from "@/lib/torbox/torbox-client";
import { dropTorrentCache, ensureCachedTorrent, type EnsuredTorrent } from "@/lib/torbox/torbox-ensure-torrent";
import { getCdnLink } from "@/lib/torbox/torbox-link-cache";
import { isVideoFile, pickVideoFile } from "@/lib/torbox/torbox-pick-video-file";
import type { TorboxFile } from "@/lib/torbox/torbox-types";

/**
 * ensure torrent (torrent_cache → add_only_if_cached) → pick the video file (exact S/E for packs; an explicit `fileId` must be
 * a video file of THIS torrent) → requestdl (50-min link cache). When TorBox answers "not found" for a remembered torrent
 * id (deleted / expired) the torrent_cache row is dropped and the whole chain runs once more — resolve self-heals.
 */
export class NoVideoFileError extends Error {
  constructor() {
    super("no matching video file");
    this.name = "NoVideoFileError";
  }
}

export type ResolvedStream = { torrent: EnsuredTorrent; file: TorboxFile; cdnUrl: string };

function chooseFile(files: TorboxFile[], fileId: number | undefined, season?: number, episode?: number): TorboxFile {
  const file = fileId !== undefined ? files.find((f) => f.id === fileId && isVideoFile(f.name)) : pickVideoFile(files, season, episode);
  if (!file) throw new NoVideoFileError();
  return file;
}

export async function resolveCdnStream(input: { hash: string; title: string; fileId?: number; season?: number; episode?: number; viewerIp?: string }): Promise<ResolvedStream> {
  const attempt = async (): Promise<ResolvedStream> => {
    const torrent = await ensureCachedTorrent(input.hash, input.title);
    const file = chooseFile(torrent.files, input.fileId, input.season, input.episode);
    const cdnUrl = await getCdnLink(torrent.torrentId, file.id, input.viewerIp);
    return { torrent, file, cdnUrl };
  };
  try {
    return await attempt();
  } catch (err) {
    if (!isTorrentGone(err)) throw err;
    console.warn("[resolve] torrent gone on TorBox, re-adding", input.hash);
    dropTorrentCache(input.hash);
    return attempt();
  }
}
