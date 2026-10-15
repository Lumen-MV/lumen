import "server-only";
import { logActivity } from "@/lib/activity/log-activity";
import { parseMediaKey, type MediaKey } from "@/lib/catalog/media-key";
import { getEnv } from "@/lib/config/env";
import { copy } from "@/lib/copy-vi";
import type { ScenarioFlag } from "@/lib/dev/scenario-flags-shared";
import { NoVideoFileError, resolveCdnStream } from "@/lib/play/resolve-cdn-stream";
import { registerSampleStream } from "@/lib/play/sample-stream";
import { registerStream, type StreamEntry } from "@/lib/play/stream-registry";
import { beatView } from "@/lib/play/viewer-limit";
import { viewerIpForStreamMode } from "@/lib/play/viewer-ip-for-stream-mode";
import { ALL_ROWS, getSources } from "@/lib/sources/sources-service";
import { sourcesPrefs } from "@/lib/http/sources-route-helpers";
import { titleLabel } from "@/lib/admin/title-label";
import type { StreamMode } from "@/lib/play/player-manifest-types";

/**
 * `/stremio/{token}/play?key=&hash=` → a registry entry for the TV (same resolve chain as the web player: ensure cached
 * torrent → pick S/E file → requestdl) + a `views` row (`mode:'stremio'`, never counted against the 5-viewer limit) + an
 * activity line. `hash=sample` (dev scenario `play-sample`) answers the local ffmpeg sample.
 */
export class StremioPlayError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}
type User = { id: number; displayName: string };

export async function resolveStremioPlay(input: { user: User; key: MediaKey; mediaKey: string; hash: string; mode: StreamMode; viewerIp: string | undefined; scenario: Set<ScenarioFlag> }): Promise<StreamEntry> {
  const { user, key, mediaKey } = input;
  if (input.hash === "sample") {
    if (!input.scenario.has("play-sample")) throw new StremioPlayError(404, "UNKNOWN_HASH");
    return registerSampleStream(user.id, mediaKey, "plain");
  }
  const { releases } = await getSources(key, { ...sourcesPrefs(user.id), show4k: true }, input.scenario, { max: ALL_ROWS });
  const release = releases.find((r) => r.hash === input.hash.toLowerCase());
  if (!release) throw new StremioPlayError(404, "UNKNOWN_HASH");
  try {
    const { torrent, file, cdnUrl } = await resolveCdnStream({ hash: release.hash, title: release.title, season: key.season, episode: key.episode, viewerIp: viewerIpForStreamMode(input.mode, input.viewerIp) });
    const fileName = file.short_name ?? file.name.split("/").pop() ?? file.name;
    return registerStream({ cdnUrl, torrentId: torrent.torrentId, fileId: file.id, fileName, userId: user.id, mediaKey, release: { hash: release.hash, title: release.title, qualityLabel: release.qualityLabel }, playClass: release.playClass });
  } catch (err) {
    if (err instanceof NoVideoFileError) throw new StremioPlayError(404, "NO_VIDEO_FILE");
    throw err;
  }
}

/** One beat + one activity line per play (TV players do not heartbeat). */
export async function recordStremioPlay(user: User, key: MediaKey, hash: string): Promise<void> {
  beatView(user.id, key, "stremio", hash, copy.stremio.deviceLabel);
  logActivity("view", copy.admin.activity.viewApp(user.displayName, await titleLabel(key), copy.stremio.app), user.id);
}

/** Where the 302 goes: the CDN itself (direct) or our same-origin file route bound to the device token (proxy). */
export function playRedirectTarget(entry: StreamEntry, mode: StreamMode, base: string, token: string): string {
  return mode === "proxy" ? `${base}/stremio/${token}/file/${entry.streamId}` : entry.cdnUrl;
}

export const parsePlayKey = (raw: string | null): MediaKey | null => parseMediaKey(raw);
export const appUrl = (): string => getEnv().APP_URL;
