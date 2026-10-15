import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/require-admin";
import { listJobsForSeason, toCloudJob } from "@/lib/cloud/cloud-jobs-store";
import { readScenario } from "@/lib/dev/scenario-flags";
import { mediaKeyParam, sourcesErrorResponse, sourcesPrefs } from "@/lib/http/sources-route-helpers";
import { parsePositiveInt } from "@/lib/http/catalog-route-helpers";
import { getSources, TORRENTIO_TTL_MS } from "@/lib/sources/sources-service";
import type { EpisodeSourceStatus, SeasonSourcesResponse } from "@/lib/sources/sources-types";
import { getTitleSources, isStale, seasonSources } from "@/lib/sources/title-sources-store";

/**
 * GET /api/sources/season?key=tv:66732&s=4 → {episodes:{[n]:{cacheState, job?}}} for the episode chips.
 * Reads title_sources; when the season has never been checked, ONE sources call for E1 (season packs then cover
 * every episode). Episodes without a row stay absent (chip slot empty).
 */
export async function GET(req: Request) {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  const key = mediaKeyParam(req, "key");
  if (key instanceof NextResponse) return key;
  const season = parsePositiveInt(new URL(req.url).searchParams.get("s") ?? "", 200);
  if (key.type !== "tv" || season === null) return NextResponse.json({ code: "BAD_REQUEST", issues: ["key", "s"] }, { status: 400 });
  try {
    const first = { type: "tv" as const, tmdbId: key.tmdbId, season, episode: 1 };
    if (isStale(getTitleSources(first), TORRENTIO_TTL_MS) && readScenario(req).size === 0) await getSources(first, sourcesPrefs(me.user.id)).catch((err) => console.warn("[sources/season] warm failed", err instanceof Error ? err.message : err));
    const episodes: Record<number, EpisodeSourceStatus> = {};
    for (const [n, row] of seasonSources(key.tmdbId, season)) episodes[n] = { cacheState: row.cachedCount > 0 ? "cached" : "uncached" };
    for (const row of listJobsForSeason(key.tmdbId, season)) {
      if (!row.episode || row.state === "ready") continue;
      episodes[row.episode] = { cacheState: episodes[row.episode]?.cacheState ?? "uncached", job: toCloudJob(row) };
    }
    const body: SeasonSourcesResponse = { episodes };
    return NextResponse.json(body);
  } catch (err) {
    return sourcesErrorResponse("sources/season", err);
  }
}
