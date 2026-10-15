import type { Release, SourcesResponse } from "./sources-types";

/**
 * Pure "Lần trước" selection (no I/O; shared by /api/sources, /api/play/resolve, the Stremio stream list and the client):
 * the remembered release wins only while it is CACHED and present in the current ranked list — a pref must never start a
 * cloud download behind the primary button. Series: the exact hash (e.g. a season pack) usually covers the next episode;
 * when it does not, the best cached row with the same release group AND quality is taken, else the same quality.
 * Movies only honour the exact hash. Nothing matches → the caller uses `best` and the UI shows the "không còn sẵn" note.
 */
export type ReleasePrefLike = { hash: string; quality: string; releaseGroup: string };

export type PreferredSelection = {
  /** the cached release the primary action should use, null when the pref does not apply */
  release: Release | null;
  applies: boolean;
  /** `release.hash` when it applies, else the stored hash (so the picker can still tag it + offer "Quên lựa chọn") */
  preferredHash: string | null;
};

const NONE: PreferredSelection = { release: null, applies: false, preferredHash: null };

export function selectPreferredRelease(releases: Release[], pref: ReleasePrefLike | null | undefined, series: boolean): PreferredSelection {
  if (!pref) return NONE;
  const exact = releases.find((r) => r.hash === pref.hash);
  if (exact?.cacheState === "cached") return { release: exact, applies: true, preferredHash: exact.hash };
  if (series) {
    const sameQuality = releases.filter((r) => r.cacheState === "cached" && r.qualityLabel === pref.quality);
    const group = pref.releaseGroup.trim().toLowerCase();
    const match = (group ? sameQuality.find((r) => r.parsed.group.toLowerCase() === group) : undefined) ?? sameQuality[0];
    if (match) return { release: match, applies: true, preferredHash: match.hash };
  }
  return { release: null, applies: false, preferredHash: pref.hash };
}

/** `{preferredHash, preferredApplies}` for the /api/sources answer (and the prefs POST echo). */
export function preferredFields(releases: Release[], pref: ReleasePrefLike | null | undefined, series: boolean): Pick<SourcesResponse, "preferredHash" | "preferredApplies"> {
  const sel = selectPreferredRelease(releases, pref, series);
  return { preferredHash: sel.preferredHash, preferredApplies: sel.applies };
}

/** Client side: the release the primary action uses — the applied pref row, else `best`. */
export function primaryRelease(data: SourcesResponse | null): Release | null {
  if (!data) return null;
  if (data.preferredApplies && data.preferredHash) return data.releases.find((r) => r.hash === data.preferredHash) ?? data.best;
  return data.best;
}

/**
 * Stale pref = stored, not applying and not on its way (no queued / downloading job on that row): the facts line shows
 * "Bản đã chọn không còn sẵn, dùng bản đề xuất".
 */
export function preferredIsStale(data: SourcesResponse | null): boolean {
  if (!data?.preferredHash || data.preferredApplies) return false;
  const job = data.releases.find((r) => r.hash === data.preferredHash)?.job?.state;
  return job !== "queued" && job !== "downloading";
}
