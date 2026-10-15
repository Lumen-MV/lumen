import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/require-admin";
import { setMyList } from "@/lib/catalog/user-media-flags";
import { parseMediaKeyBody } from "@/lib/http/media-key-body";
import { listMyList } from "@/lib/my-list/my-list-store";
import { matchesFilter, sortItems, type MyListFilter, type MyListSort } from "@/lib/my-list/my-list-reducers";

export const dynamic = "force-dynamic";

/** POST/DELETE /api/my-list {mediaKey} → {saved:boolean} */
async function toggle(req: Request, saved: boolean) {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  const key = await parseMediaKeyBody(req);
  if (key instanceof NextResponse) return key;
  try {
    return NextResponse.json({ saved: setMyList(me.user.id, key, saved) });
  } catch (err) {
    console.error("[my-list]", err);
    return NextResponse.json({ code: "SERVER_ERROR" }, { status: 500 });
  }
}

export const POST = (req: Request) => toggle(req, true);
export const DELETE = (req: Request) => toggle(req, false);

const FILTERS = new Set<MyListFilter>(["all", "movie", "tv", "cached"]);
const SORTS = new Set<MyListSort>(["added", "name", "year"]);

/** GET /api/my-list?filter=all|movie|tv|cached&sort=added|name|year → {items: (CardItem & {addedAt, cacheState})[]} */
export async function GET(req: Request) {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  const url = new URL(req.url);
  const filter = (url.searchParams.get("filter") ?? "all") as MyListFilter;
  const sort = (url.searchParams.get("sort") ?? "added") as MyListSort;
  if (!FILTERS.has(filter) || !SORTS.has(sort)) return NextResponse.json({ code: "BAD_REQUEST", issues: ["filter|sort"] }, { status: 400 });
  try {
    const items = sortItems((await listMyList(me.user.id)).filter((i) => matchesFilter(i, filter)), sort);
    return NextResponse.json({ items }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[my-list list]", err);
    return NextResponse.json({ code: "SERVER_ERROR" }, { status: 500 });
  }
}
