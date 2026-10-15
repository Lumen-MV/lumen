import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/require-admin";
import { catalogErrorResponse, parsePositiveInt } from "@/lib/http/catalog-route-helpers";
import { getSeriesProgress } from "@/lib/progress/series-progress";
import { getSeries } from "@/lib/tmdb/catalog-queries-detail";

export const dynamic = "force-dynamic";

/** GET /api/series/[id]/progress → SeriesProgressDto (hero primary, facts, season watched counts, per-episode bars). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  const id = parsePositiveInt((await ctx.params).id);
  if (id === null) return NextResponse.json({ code: "BAD_REQUEST", issues: ["id"] }, { status: 400 });
  try {
    const series = await getSeries(id);
    return NextResponse.json(await getSeriesProgress(me.user.id, id, series.seasons), { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return catalogErrorResponse("series/progress", err);
  }
}
