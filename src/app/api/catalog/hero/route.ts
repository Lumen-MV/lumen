import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/require-admin";
import { catalogErrorResponse } from "@/lib/http/catalog-route-helpers";
import { getHero } from "@/lib/tmdb/catalog-queries-home";

/** GET /api/catalog/hero → {items: HeroItem[5]} (trending movies with details, saved flag per user). */
export async function GET() {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  try {
    return NextResponse.json({ items: await getHero(me.user.id) });
  } catch (err) {
    return catalogErrorResponse("catalog/hero", err);
  }
}
