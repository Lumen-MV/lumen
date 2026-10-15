import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { readScenario } from "@/lib/dev/scenario-flags";
import { getAdminStats } from "@/lib/admin/admin-stats-service";

export const dynamic = "force-dynamic";

/** GET /api/admin/stats → {members, watchingNow, viewsMonth, ai, torbox, os, bars} (admin only). */
export async function GET(req: Request) {
  const me = await requireAdminApi();
  if (me instanceof NextResponse) return me;
  try {
    return NextResponse.json(await getAdminStats(readScenario(req)), { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[admin/stats]", err);
    return NextResponse.json({ code: "SERVER_ERROR" }, { status: 500 });
  }
}
