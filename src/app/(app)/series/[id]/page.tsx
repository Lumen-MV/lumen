import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { DetailSkeleton } from "@/components/catalog/detail-skeleton";
import { SeriesDetailBody } from "@/components/catalog/series-detail-body";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { parsePositiveInt } from "@/lib/http/catalog-route-helpers";
import { assertTitleExists } from "@/lib/tmdb/catalog-queries-detail";
import { isTmdbNotFound } from "@/lib/tmdb/tmdb-client";

export const dynamic = "force-dynamic";

/**
 * /series/[id]?s=N&e=M — the primary TMDB fetch runs BEFORE the Suspense boundary so an unknown id answers a real
 * HTTP 404; the 520px detail skeleton is the body's fallback while series + season resolve (see movie/[id]).
 */
export default async function SeriesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ s?: string; e?: string }> }) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  const id = parsePositiveInt((await params).id);
  if (id === null) notFound();
  try {
    await assertTitleExists("tv", id);
  } catch (err) {
    if (isTmdbNotFound(err)) notFound();
    throw err;
  }
  const sp = await searchParams;
  const requestedSeason = parsePositiveInt(sp.s ?? "", 200);
  const requestedEpisode = parsePositiveInt(sp.e ?? "", 9999);
  return (
    <Suspense fallback={<DetailSkeleton variant="series" />}>
      <SeriesDetailBody id={id} userId={me.user.id} requestedSeason={requestedSeason} requestedEpisode={requestedEpisode} />
    </Suspense>
  );
}
