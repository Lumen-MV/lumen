import "server-only";
import { parseMediaKey } from "@/lib/catalog/media-key";
import type { ScenarioFlag } from "@/lib/dev/scenario-flags-shared";
import type { StreamEntry } from "@/lib/play/stream-registry";
import { containerFromName } from "@/lib/sources/release-parser";
import { getMovie, getSeries } from "@/lib/tmdb/catalog-queries-detail";
import { getUserSettings } from "@/lib/users/user-settings";
import { readOsQuota } from "./os-quota-store";
import { autoSelectTrack } from "./subtitle-auto-select";
import { gatherCommunityCandidates } from "./subtitle-community-providers";
import { discoverEmbeddedTracks } from "./subtitle-embedded-discovery";
import { searchTtlMs } from "./subtitle-search-cache-policy";
import { ensureSimRows, simRowsFor, simStateFor } from "./subtitle-sim";
import { getSubtitlePrefs, hasVtt, listSubRows, upsertCandidate, type SubRow } from "./subtitle-store";
import { rankTracks } from "./subtitle-track-ranking";
import { vttUrlFor, type SubsSearchResponse, type SubTrack } from "./subtitle-types";
import { jobStatusForUser } from "@/lib/translate/translate-job-registry";

/**
 * `GET /api/subs/search`: community providers once per title per 24 h (in-memory stamp; rows persist in subtitle_cache;
 * only 10 min after a provider / TMDB failure — see subtitle-search-cache-policy.ts), embedded text streams only for
 * MKV releases with no community vi (once per release hash), ranking + labels + 🔒, auto-select, quota, prefs,
 * running job. The dev sim short-circuits everything for the local sample / `subs-sim`.
 */
const g = globalThis as unknown as { __hcSubsSearchedUntil?: Map<string, number> };
const validUntil = (): Map<string, number> => (g.__hcSubsSearchedUntil ??= new Map());
export const forgetSubtitleSearch = (mediaKey: string): void => void validUntil().delete(mediaKey);

export type SearchInput = { mediaKey: string; entry: StreamEntry | null; userId: number; scenario: Set<ScenarioFlag>; params: Map<ScenarioFlag, string> };

async function imdbFor(mediaKey: string): Promise<string | null> {
  const key = parseMediaKey(mediaKey);
  if (!key) return null;
  const detail = key.type === "movie" ? await getMovie(key.tmdbId) : await getSeries(key.tmdbId);
  return detail.imdbId;
}

async function communityRows(mediaKey: string): Promise<SubRow[]> {
  const until = validUntil().get(mediaKey);
  if (until && Date.now() < until) return listSubRows(mediaKey);
  const key = parseMediaKey(mediaKey)!;
  const imdbId = await imdbFor(mediaKey).catch((err: unknown) => {
    console.warn("[subs] imdb lookup failed", mediaKey, err instanceof Error ? err.message : err);
    return null;
  });
  const { candidates, failed } = await gatherCommunityCandidates(mediaKey, key, imdbId);
  for (const c of candidates) upsertCandidate(c);
  validUntil().set(mediaKey, Date.now() + searchTtlMs({ failed, imdbId }));
  return listSubRows(mediaKey);
}

export function tracksFromRows(rows: SubRow[], scenario: Set<ScenarioFlag>, entry: StreamEntry | null): SubTrack[] {
  const quota = readOsQuota(scenario);
  // embedded extraction needs the CDN URL → the VTT URL carries the stream handle (owner-checked by the route)
  const url = (id: number) => { const r = rows.find((x) => x.id === id); return r?.source === "embedded" && entry ? `${vttUrlFor(id)}?streamId=${entry.streamId}` : vttUrlFor(id); };
  const playing = entry ? { title: entry.release.title, fileName: entry.fileName } : null;
  return rankTracks(rows.map((r) => ({ id: r.id, lang: r.lang, source: r.source, label: r.label, downloads: r.downloads, ready: hasVtt(r) })), quota, url, playing);
}

export async function searchSubtitles(input: SearchInput): Promise<SubsSearchResponse> {
  const { mediaKey, entry, userId, scenario, params } = input;
  const sim = simStateFor(params, entry);
  let rows: SubRow[];
  if (sim) rows = simRowsFor(sim, ensureSimRows(mediaKey));
  else {
    rows = await communityRows(mediaKey);
    const hasVi = rows.some((r) => r.lang === "vi" && r.source !== "ai" && r.source !== "os_mt");
    if (!hasVi && entry && containerFromName(entry.fileName).toLowerCase() === "mkv") rows = await discoverEmbeddedTracks(mediaKey, entry, rows);
  }
  const tracks = tracksFromRows(rows, scenario, entry);
  const settings = getUserSettings(userId);
  const prefs = getSubtitlePrefs(userId, mediaKey, settings.sub_size);
  const job = jobStatusForUser(userId, mediaKey);
  return { tracks, selectedId: autoSelectTrack(tracks, prefs.selectedSubId, settings.sub_lang), hasEnglish: tracks.some((t) => t.lang === "en" && !t.locked), quota: readOsQuota(scenario), prefs: { offsetMs: prefs.offsetMs, size: prefs.size }, autoTranslate: settings.auto_translate && sim === null, ...(job ? { job } : {}) };
}

/** Manifest field: whatever is already cached for the title (never triggers a provider call). */
export function cachedSubtitleTracks(mediaKey: string, scenario: Set<ScenarioFlag>, entry: StreamEntry | null): SubTrack[] {
  try {
    return tracksFromRows(listSubRows(mediaKey), scenario, entry);
  } catch (err) {
    console.warn("[subs] cached tracks", err instanceof Error ? err.message : err);
    return [];
  }
}
