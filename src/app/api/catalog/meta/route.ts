import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/require-admin";
import { formatMediaKey, parseMediaKey } from "@/lib/catalog/media-key";
import { getUserMediaFlags } from "@/lib/catalog/user-media-flags";
import { catalogErrorResponse } from "@/lib/http/catalog-route-helpers";
import { getTitleMeta, type TitleMetaResponse } from "@/lib/tmdb/catalog-queries-detail";

/** GET /api/catalog/meta?key=movie:634649 → {year, runtime, rating, genres, overviewLang, saved, liked} for the card hover panel. */
export async function GET(req: Request) {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  const key = parseMediaKey(new URL(req.url).searchParams.get("key"));
  if (!key) return NextResponse.json({ code: "BAD_REQUEST", issues: ["key"] }, { status: 400 });
  try {
    const meta = await getTitleMeta(key);
    const flags = getUserMediaFlags(me.user.id, [key]);
    const titleKey = formatMediaKey(key.type, key.tmdbId);
    const body: TitleMetaResponse = { ...meta, saved: flags.saved.has(titleKey), liked: flags.liked.has(titleKey) };
    return NextResponse.json(body);
  } catch (err) {
    return catalogErrorResponse("catalog/meta", err);
  }
}
