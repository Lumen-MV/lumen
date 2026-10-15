import { percentOf } from "./progress-rules";

/**
 * Pure series-progress rules (spec phase-04): hero primary button, facts / kv texts, per-season watched counts and the
 * "next unwatched" episode. Inputs are plain rows so the API route, the fixtures and the unit tests share them.
 */
export type EpisodeProgressRow = { season: number; episode: number; positionS: number; durationS: number; completed: boolean; updatedAt: number };
export type SeasonInfo = { n: number; episodeCount: number; unairedCount: number };
/** aired episode numbers per season when known (fetched from TMDB for the seasons that matter) */
export type AiredMap = Record<number, number[]>;

export type SeriesPrimary = { kind: "first" | "continue" | "next" | "replay"; season: number; episode: number; positionS: number; percent: number };
export type EpisodeProgressMap = Record<string, { percent: number; completed: boolean; positionS: number }>;

export const episodeKey = (s: number, e: number) => `${s}:${e}`;

export function episodeMap(rows: EpisodeProgressRow[]): EpisodeProgressMap {
  const out: EpisodeProgressMap = {};
  for (const r of rows) out[episodeKey(r.season, r.episode)] = { percent: r.completed ? 100 : percentOf(r.positionS, r.durationS), completed: r.completed, positionS: r.positionS };
  return out;
}

/** watched (completed) episodes per season */
export function watchedCounts(rows: EpisodeProgressRow[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (const r of rows) if (r.completed) out[r.season] = (out[r.season] ?? 0) + 1;
  return out;
}

/** Aired episode numbers of a season: the fetched list when known, else 1..(episodeCount − unairedCount). */
function airedEpisodes(season: SeasonInfo, aired: AiredMap): number[] {
  if (aired[season.n]) return aired[season.n];
  const n = Math.max(0, season.episodeCount - season.unairedCount);
  return Array.from({ length: n }, (_, i) => i + 1);
}

/** First aired episode after (s, e) in season order; null when none has aired yet. */
export function episodeAfter(seasons: SeasonInfo[], aired: AiredMap, s: number, e: number): { season: number; episode: number } | null {
  const ordered = [...seasons].sort((a, b) => a.n - b.n);
  for (const season of ordered) {
    if (season.n < s) continue;
    for (const ep of airedEpisodes(season, aired)) {
      if (season.n === s && ep <= e) continue;
      return { season: season.n, episode: ep };
    }
  }
  return null;
}

function firstUnwatched(seasons: SeasonInfo[], aired: AiredMap, done: Set<string>): { season: number; episode: number } | null {
  for (const season of [...seasons].sort((a, b) => a.n - b.n)) for (const ep of airedEpisodes(season, aired)) if (!done.has(episodeKey(season.n, ep))) return { season: season.n, episode: ep };
  return null;
}

/**
 * no rows → first (S1 T1) · latest row in progress → continue · latest completed and a later aired episode exists → next
 * (the one right after it, else the first unwatched anywhere) · everything aired watched → replay S1 T1.
 */
export function seriesPrimary(rows: EpisodeProgressRow[], seasons: SeasonInfo[], aired: AiredMap = {}): SeriesPrimary {
  const firstSeason = [...seasons].sort((a, b) => a.n - b.n)[0]?.n ?? 1;
  const first: SeriesPrimary = { kind: "first", season: firstSeason, episode: 1, positionS: 0, percent: 0 };
  if (!rows.length) return first;
  const latest = [...rows].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (!latest.completed) return { kind: "continue", season: latest.season, episode: latest.episode, positionS: latest.positionS, percent: percentOf(latest.positionS, latest.durationS) };
  const done = new Set(rows.filter((r) => r.completed).map((r) => episodeKey(r.season, r.episode)));
  const after = episodeAfter(seasons, aired, latest.season, latest.episode);
  const next = after && !done.has(episodeKey(after.season, after.episode)) ? after : firstUnwatched(seasons, aired, done);
  if (next) return { kind: "next", season: next.season, episode: next.episode, positionS: 0, percent: 0 };
  return { ...first, kind: "replay" };
}

/** Last completed episode (for the "Đã xem S4 T1" fact) — the most recently updated completed row. */
export function lastCompleted(rows: EpisodeProgressRow[]): { season: number; episode: number } | null {
  const r = [...rows].filter((x) => x.completed).sort((a, b) => b.updatedAt - a.updatedAt)[0];
  return r ? { season: r.season, episode: r.episode } : null;
}
