import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/require-admin";
import { withUserFlags } from "@/lib/catalog/user-media-flags";
import { catalogErrorResponse } from "@/lib/http/catalog-route-helpers";
import { discoverCached } from "@/lib/sources/cached-browse";
import { withCacheState } from "@/lib/sources/title-sources-store";
import { discover } from "@/lib/tmdb/catalog-queries-browse";
import { parseDiscoverFilters, type BrowseType } from "@/lib/tmdb/discover-filters";

const TYPES: readonly string[] = ["movie", "tv", "anime"];

/** GET /api/catalog/discover?type=movie|tv|anime&year=&genre=&sort=&q4k=&cached=&page= → {items, page, totalResults, done}; `cached=1` lists title_sources */
export async function GET(req: Request) {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  const sp = new URL(req.url).searchParams;
  const type = sp.get("type") ?? "movie";
  if (!TYPES.includes(type)) return NextResponse.json({ code: "BAD_REQUEST", issues: ["type"] }, { status: 400 });
  try {
    const filters = parseDiscoverFilters(type as BrowseType, sp);
    // "Chỉ phim đã cache" → title_sources is the source list (Phase 3); otherwise TMDB discover + cache markers
    const page = filters.cachedOnly ? await discoverCached(filters) : await discover(filters);
    return NextResponse.json({ ...page, items: withCacheState(withUserFlags(me.user.id, page.items)) });
  } catch (err) {
    return catalogErrorResponse("catalog/discover", err);
  }
}
