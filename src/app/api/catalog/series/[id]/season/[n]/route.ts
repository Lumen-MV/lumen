import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/require-admin";
import { catalogErrorResponse, parsePositiveInt } from "@/lib/http/catalog-route-helpers";
import { getSeason } from "@/lib/tmdb/catalog-queries-detail";

/** GET /api/catalog/series/[id]/season/[n] → {episodes:[{n,title,overview,runtimeMin,stillUrl,airDate,aired}], unairedCount} */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; n: string }> }) {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  const { id, n } = await ctx.params;
  const seriesId = parsePositiveInt(id);
  const season = parsePositiveInt(n, 200);
  if (seriesId === null || season === null) return NextResponse.json({ code: "BAD_REQUEST", issues: ["id|n"] }, { status: 400 });
  try {
    return NextResponse.json(await getSeason(seriesId, season));
  } catch (err) {
    return catalogErrorResponse("catalog/season", err);
  }
}
