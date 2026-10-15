import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { DetailSkeleton } from "@/components/catalog/detail-skeleton";
import { MovieDetailBody } from "@/components/catalog/movie-detail-body";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { parsePositiveInt } from "@/lib/http/catalog-route-helpers";
import { assertTitleExists } from "@/lib/tmdb/catalog-queries-detail";
import { isTmdbNotFound } from "@/lib/tmdb/tmdb-client";

export const dynamic = "force-dynamic";

/**
 * /movie/[id] — the primary TMDB fetch (cached 3 d, shared with the body) runs BEFORE the Suspense boundary so an
 * unknown id answers a real HTTP 404 (a route-level loading.tsx would stream a 200 shell first). The detail
 * skeleton stays as the body's fallback while the rest of the page (genres, overview fallback, collection) resolves.
 */
export default async function MoviePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  const id = parsePositiveInt((await params).id);
  if (id === null) notFound();
  try {
    await assertTitleExists("movie", id);
  } catch (err) {
    if (isTmdbNotFound(err)) notFound();
    throw err;
  }
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <MovieDetailBody id={id} userId={me.user.id} />
    </Suspense>
  );
}
