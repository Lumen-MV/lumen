import { notFound, redirect } from "next/navigation";
import { WatchClient } from "@/components/player/watch-client";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { parseMediaKey } from "@/lib/catalog/media-key";
import { getStream } from "@/lib/play/stream-registry";
import { getMovie, getSeries } from "@/lib/tmdb/catalog-queries-detail";

export const dynamic = "force-dynamic";

/** The title's backdrop from the 3-day TMDB detail cache (the viewer just came from the detail page) — null on any failure. */
async function backdropFor(mediaKey: string): Promise<string | null> {
  const key = parseMediaKey(mediaKey);
  if (!key) return null;
  try {
    return (key.type === "movie" ? await getMovie(key.tmdbId) : await getSeries(key.tmdbId)).backdropUrl;
  } catch (err) {
    console.warn("[watch] backdrop", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * /watch/[streamId]?resume=1&t=N — validates the per-user stream handle (404 for unknown / expired / someone else's)
 * and mounts the player. The HTML carries only the streamId (+ the backdrop URL so "Đang lấy link từ Torbox…" is not
 * a black screen): the player fetches `src` from /api/play/manifest.
 */
export default async function WatchPage({ params, searchParams }: { params: Promise<{ streamId: string }>; searchParams: Promise<{ resume?: string; t?: string }> }) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  const { streamId } = await params;
  const entry = getStream(streamId, me.user.id);
  if (!entry) notFound();
  const sp = await searchParams;
  const t = sp.t !== undefined && /^\d+(\.\d+)?$/.test(sp.t) ? Number(sp.t) : null;
  return <WatchClient key={streamId} streamId={streamId} fromContinue={sp.resume === "1"} seekTo={t} initialBackdropUrl={await backdropFor(entry.mediaKey)} />;
}
