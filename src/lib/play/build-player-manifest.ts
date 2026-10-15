import "server-only";
import { formatMediaKey, parseMediaKey, type MediaKey } from "@/lib/catalog/media-key";
import { getEnv } from "@/lib/config/env";
import type { ScenarioFlag } from "@/lib/dev/scenario-flags";
import { formatRelativeVi } from "@/lib/format/time-format";
import { sourcesPrefs } from "@/lib/http/sources-route-helpers";
import { getProgress, resumeInfo } from "@/lib/progress/progress-store";
import { audioLabel, codecLabel } from "@/lib/sources/release-labels";
import { containerFromName, parseRelease } from "@/lib/sources/release-parser";
import { getSources } from "@/lib/sources/sources-service";
import { getMovie, getSeason, getSeries } from "@/lib/tmdb/catalog-queries-detail";
import type { SeasonSummary } from "@/lib/tmdb/catalog-types";
import { readTorrentCache } from "@/lib/torbox/torbox-ensure-torrent";
import { pickVideoFile } from "@/lib/torbox/torbox-pick-video-file";
import { cachedSubtitleTracks } from "@/lib/subtitles/subtitle-search-service";
import { getUserSettings } from "@/lib/users/user-settings";
import type { PlayerManifest, SeasonInfoDto, StreamMode } from "./player-manifest-types";
import { isSampleEntry, SAMPLE_HASH } from "./sample-stream";
import type { StreamEntry } from "./stream-registry";

/** Builds the player manifest for a registry entry: src per STREAM_MODE, release labels, TMDB title/episode, next episode, resume, MP4 alternative, prefs. */
export function streamMode(params: Map<ScenarioFlag, string>): StreamMode {
  const override = params.get("stream-mode");
  return override === "proxy" || override === "direct" ? override : getEnv().STREAM_MODE;
}

/** "Hôm qua" → "hôm qua": the relative time sits mid-sentence in "Bạn đã xem 41% phim này trên iPhone hôm qua." */
const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
const toDto = (s: SeasonSummary): SeasonInfoDto => ({ n: s.n, episodeCount: s.episodeCount, unairedCount: s.unairedCount });

/** Next aired episode after `episode` inside the season, or the next season that has aired episodes (null = series finished). */
async function seriesParts(entry: StreamEntry, key: MediaKey & { season: number; episode: number }): Promise<Pick<PlayerManifest, "series" | "next" | "endSeason">> {
  const series = await getSeries(key.tmdbId);
  const season = await getSeason(key.tmdbId, key.season).catch(() => ({ episodes: [], unairedCount: 0 }));
  const current = season.episodes.find((e) => e.n === key.episode);
  const out: Pick<PlayerManifest, "series" | "next" | "endSeason"> = { series: { tmdbId: key.tmdbId, season: key.season, episode: key.episode, epTitle: current?.title ?? "", seasons: series.seasons.map(toDto) } };
  const nextEp = season.episodes.find((e) => e.n > key.episode && e.aired);
  if (nextEp) {
    const cached = isSampleEntry(entry) ? null : readTorrentCache(entry.release.hash);
    const samePack = isSampleEntry(entry) || Boolean(cached && pickVideoFile(cached.files, key.season, nextEp.n));
    out.next = { mediaKey: formatMediaKey("tv", key.tmdbId, key.season, nextEp.n), season: key.season, episode: nextEp.n, title: nextEp.title, stillUrl: nextEp.stillUrl, samePack };
    return out;
  }
  // "Đã xem hết" only when nothing more is coming: an unaired episode later in this season or a later season (even a
  // dateless one) means "Tập tiếp theo chưa phát sóng · dd/mm" instead
  const pendingEp = season.episodes.find((e) => e.n > key.episode && !e.aired);
  let upcoming: { airDate: string | null } | undefined = pendingEp ? { airDate: pendingEp.airDate } : undefined;
  const later = series.seasons.filter((s) => s.n > key.season).sort((a, b) => a.n - b.n);
  for (const s of later) {
    const detail = await getSeason(key.tmdbId, s.n).catch(() => null);
    const info: SeasonInfoDto = detail ? { n: s.n, episodeCount: detail.episodes.length || s.episodeCount, unairedCount: detail.unairedCount } : toDto(s);
    if (info.episodeCount - info.unairedCount > 0) {
      out.endSeason = { season: key.season, nextSeason: info };
      return out;
    }
    upcoming ??= { airDate: detail?.episodes[0]?.airDate ?? s.airDate ?? null };
  }
  out.endSeason = { season: key.season, nextSeason: null, upcoming };
  return out;
}

async function mp4Alternative(entry: StreamEntry, key: MediaKey, userId: number, scenario: Set<ScenarioFlag>): Promise<PlayerManifest["mp4Alt"]> {
  if (entry.playClass === "direct") return null;
  if (isSampleEntry(entry)) return { hash: SAMPLE_HASH, group: "YTS", sizeLabel: "2.7 GB" };
  try {
    const { releases } = await getSources(key, sourcesPrefs(userId), scenario);
    const alt = releases.find((r) => r.cacheState === "cached" && r.playClass === "direct" && r.hash !== entry.release.hash);
    return alt ? { hash: alt.hash, group: alt.parsed.group, sizeLabel: alt.sizeLabel } : null;
  } catch (err) {
    console.warn("[manifest] mp4 alternative", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function buildPlayerManifest(entry: StreamEntry, userId: number, mode: StreamMode, scenario: Set<ScenarioFlag>): Promise<PlayerManifest> {
  const key = parseMediaKey(entry.mediaKey)!;
  const parsed = parseRelease(entry.release.title, entry.fileName);
  const container = containerFromName(entry.fileName).toUpperCase();
  const settings = getUserSettings(userId);
  const titleP = key.type === "movie" ? getMovie(key.tmdbId) : getSeries(key.tmdbId);
  const [title, parts, mp4Alt] = await Promise.all([titleP, key.type === "tv" && key.season !== undefined && key.episode !== undefined ? seriesParts(entry, { ...key, season: key.season, episode: key.episode }) : Promise.resolve({}), mp4Alternative(entry, key, userId, scenario)]);
  const resume = resumeInfo(getProgress(userId, key));
  return {
    streamId: entry.streamId,
    mode,
    src: mode === "proxy" ? `/api/play/stream/${entry.streamId}` : entry.cdnUrl,
    expiresAt: entry.expiresAt,
    playClass: entry.playClass,
    qualityLabel: entry.release.qualityLabel,
    container: container === "UNKNOWN" ? "MP4" : container,
    codec: codecLabel(parsed, entry.release.title),
    audio: audioLabel(parsed),
    fileName: entry.fileName,
    releaseHash: entry.release.hash,
    releaseGroup: parsed.group,
    sizeLabel: "",
    mediaKey: entry.mediaKey,
    title: title.title,
    backdropUrl: title.backdropUrl,
    imdbId: title.imdbId,
    ...parts,
    resume: resume ? { positionS: resume.positionS, percent: resume.percent, device: resume.device, when: lowerFirst(formatRelativeVi(resume.updatedAt)) } : undefined,
    mp4Alt,
    autoplayNext: settings.autoplay_next,
    askResume: settings.ask_resume,
    subtitleTracks: cachedSubtitleTracks(entry.mediaKey, scenario, entry),
  };
}
