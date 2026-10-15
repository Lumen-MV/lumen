import { NextResponse } from "next/server";
import { activityCsv, isActivityFilter } from "@/lib/admin/activity-filter-rules";
import { activityPeople, listActivity, type ActivityQuery } from "@/lib/admin/admin-activity-service";
import { requireAdminApi } from "@/lib/auth/require-admin";

/** Shared by /api/admin/activity (JSON) and /api/admin/activity.csv: query parsing + admin guard. */
function parseQuery(req: Request): ActivityQuery | NextResponse {
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") ?? "all";
  if (!isActivityFilter(kind)) return NextResponse.json({ code: "BAD_REQUEST", issues: ["kind"] }, { status: 400 });
  const userRaw = url.searchParams.get("userId");
  const userId = userRaw ? Number(userRaw) : null;
  if (userId !== null && (!Number.isInteger(userId) || userId <= 0)) return NextResponse.json({ code: "BAD_REQUEST", issues: ["userId"] }, { status: 400 });
  const month = url.searchParams.get("month");
  if (month && !/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ code: "BAD_REQUEST", issues: ["month"] }, { status: 400 });
  return { filter: kind, userId, month: month || null };
}

export async function adminActivityResponse(req: Request, format: "json" | "csv"): Promise<NextResponse> {
  const me = await requireAdminApi();
  if (me instanceof NextResponse) return me;
  const q = parseQuery(req);
  if (q instanceof NextResponse) return q;
  try {
    if (format === "json") return NextResponse.json({ entries: listActivity(q), people: activityPeople() }, { headers: { "cache-control": "no-store" } });
    const name = `lumen-activity-${q.month ?? new Date().toISOString().slice(0, 7)}.csv`;
    return new NextResponse(activityCsv(listActivity({ ...q, limit: 5000 })), { status: 200, headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" } });
  } catch (err) {
    console.error("[admin/activity]", err);
    return NextResponse.json({ code: "SERVER_ERROR" }, { status: 500 });
  }
}
