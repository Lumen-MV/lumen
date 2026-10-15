import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ContinueWatchingSection } from "@/components/catalog/continue-watching-section";
import { HeroBanner } from "@/components/catalog/hero-banner";
import { MediaRow } from "@/components/catalog/media-row";
import { RefreshErrorBox } from "@/components/catalog/refresh-error-box";
import { HomeRowSkeleton } from "@/components/catalog/row-skeleton";
import { TmdbFooter } from "@/components/catalog/tmdb-footer";
import { Top10Row } from "@/components/catalog/top10-row";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { countMembers, withUserFlags } from "@/lib/catalog/user-media-flags";
import { copy } from "@/lib/copy-vi";
import { continueRows } from "@/lib/progress/continue-list";
import { getNewInCacheRow } from "@/lib/sources/new-in-cache-row";
import { withinLastDays } from "@/lib/tmdb/catalog-mappers";
import { getHero, getHomeRows, type HomeRow } from "@/lib/tmdb/catalog-queries-home";
import type { CardItem } from "@/lib/tmdb/catalog-types";

export const dynamic = "force-dynamic";

const NEW_MOVIE_DAYS = 7;
const NEW_SEASON_DAYS = 14;
const badges = copy.home.badges;
const SEE_ALL: Record<HomeRow["key"], string> = { top10Movies: "/movies", trendingSeries: "/series", forYou: "/movies", anime: "/anime" };

/** Badges are computed here (server) and travel as a plain `badge` field — functions cannot be passed to client rows. */
function withBadges(key: HomeRow["key"], items: CardItem[]): CardItem[] {
  if (key === "top10Movies") return items.map((it) => (withinLastDays(it.releaseDate, NEW_MOVIE_DAYS) ? { ...it, badge: badges.newlyAdded } : it));
  if (key === "trendingSeries") return items.map((it) => (withinLastDays(it.lastAirDate, NEW_SEASON_DAYS) ? { ...it, badge: badges.newSeason } : it));
  return items;
}

/**
 * Home: hero (trending top 5) + rows in mockup order + "Mới thêm vào cache" (title_sources, hidden while empty).
 * "Tiếp tục xem" (progress rows, Phase 4) sits right under the hero and is omitted while empty ("first-time"); its TMDB
 * enrichment streams in behind Suspense so a cold detail cache never delays the shell.
 * Hero failure → whole-page errbox; a single failed row → inline errbox.
 */
export default async function HomePage() {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  const hasContinue = continueRows(me.user.id).length > 0;
  const [heroResult, rows, newInCache] = await Promise.all([
    getHero(me.user.id).then((items) => ({ items }), (err: unknown) => ({ err })),
    getHomeRows(me.user.id),
    getNewInCacheRow().catch((err: unknown) => {
      console.warn("[home] new-in-cache row failed", err instanceof Error ? err.message : err);
      return [];
    }),
  ]);
  if ("err" in heroResult) {
    console.warn("[home] hero failed", heroResult.err instanceof Error ? heroResult.err.message : heroResult.err);
    return (
      <main style={{ padding: "120px var(--pad) 40px", minHeight: "calc(100vh - 68px)" }}>
        <RefreshErrorBox message={copy.home.errCatalog} />
      </main>
    );
  }
  return (
    <main>
      <HeroBanner items={heroResult.items} />
      {hasContinue && (
        <Suspense fallback={<HomeRowSkeleton titleWidth={180} n={6} wide />}>
          <ContinueWatchingSection userId={me.user.id} seeAllHref="/my-list" />
        </Suspense>
      )}
      {rows.map((row) =>
        row.key === "top10Movies" && row.items ? (
          <Top10Row key={row.key} title={row.title} items={withBadges(row.key, row.items)} seeAllHref={SEE_ALL[row.key]} />
        ) : (
          <MediaRow key={row.key} title={row.title} items={withBadges(row.key, row.items ?? [])} error={row.error} seeAllHref={SEE_ALL[row.key]} />
        ),
      )}
      {newInCache.length > 0 && <MediaRow title={copy.home.rows.newInCache} items={withUserFlags(me.user.id, newInCache)} />}
      <TmdbFooter memberCount={countMembers()} />
    </main>
  );
}
