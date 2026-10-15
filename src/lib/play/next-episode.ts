import type { ResolveResponse } from "@/lib/sources/sources-types";

/**
 * Next-episode / episode-switch resolution (phase-04 Key Insights): same torrent carries the file → resolve with the
 * same hash; else the best cached direct release (`auto:true`); a 409 means nothing cached → the caller opens the
 * picker scoped to that episode. Injected `post` keeps it unit-testable.
 */
export type PostJson = (path: string, body: unknown) => Promise<{ status: number; json: Record<string, unknown> | null }>;

export type NextTarget = { mediaKey: string; samePack: boolean; currentHash: string };
export type NextOutcome = { kind: "stream"; streamId: string } | { kind: "picker" } | { kind: "error"; status: number };

export const fetchPostJson: PostJson = async (path, body) => {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, json: (await r.json().catch(() => null)) as Record<string, unknown> | null };
};

export async function resolveNextEpisode(target: NextTarget, post: PostJson = fetchPostJson): Promise<NextOutcome> {
  const asOutcome = (r: { status: number; json: Record<string, unknown> | null }): NextOutcome | null => {
    const id = (r.json as Partial<ResolveResponse> | null)?.streamId;
    if (r.status === 200 && typeof id === "string") return { kind: "stream", streamId: id };
    return null;
  };
  if (target.samePack) {
    const r = await post("/api/play/resolve", { mediaKey: target.mediaKey, hash: target.currentHash });
    const out = asOutcome(r);
    if (out) return out;
    // the pack file was not found after all (404 NO_VIDEO_FILE) → fall through to the best cached release
    if (r.status !== 404 && r.status !== 409) return { kind: "error", status: r.status };
  }
  const r = await post("/api/play/resolve", { mediaKey: target.mediaKey, auto: true });
  const out = asOutcome(r);
  if (out) return out;
  if (r.status === 409 || r.status === 404) return { kind: "picker" };
  return { kind: "error", status: r.status };
}

/** `/series/{id}?s=&e=&pick=1` — the detail page opens the source picker for that episode. */
export const pickerHref = (tmdbId: number, season: number, episode: number): string => `/series/${tmdbId}?s=${season}&e=${episode}&pick=1`;
