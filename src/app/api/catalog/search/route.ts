import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/require-admin";
import { withUserFlags } from "@/lib/catalog/user-media-flags";
import { catalogErrorResponse, parsePositiveInt } from "@/lib/http/catalog-route-helpers";
import { search, type SearchType } from "@/lib/tmdb/catalog-queries-browse";
import { MAX_QUERY, MIN_QUERY } from "@/lib/tmdb/search-query-rules";

const TYPES: readonly string[] = ["all", "movie", "tv"];

/** GET /api/catalog/search?q=&page=&type=all|movie|tv → {items, counts:{all,movie,tv}, page, totalResults, done} */
export async function GET(req: Request) {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") ?? "").trim().slice(0, MAX_QUERY);
  const type = sp.get("type") ?? "all";
  const page = parsePositiveInt(sp.get("page") ?? "1", 500);
  if (q.length < MIN_QUERY || !TYPES.includes(type) || page === null) return NextResponse.json({ code: "BAD_REQUEST", issues: ["q|type|page"] }, { status: 400 });
  try {
    const result = await search(q, page, type as SearchType);
    return NextResponse.json({ ...result, items: withUserFlags(me.user.id, result.items) });
  } catch (err) {
    return catalogErrorResponse("catalog/search", err);
  }
}
