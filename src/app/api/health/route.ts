import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getEnv } from "@/lib/config/env";
import { getDb } from "@/lib/db/sqlite-client";
import { torboxStats } from "@/lib/torbox/torbox-client";

export const dynamic = "force-dynamic";

/**
 * Docker HEALTHCHECK + screenshot runner readiness probe. Anonymous callers (the route is public) get `{ok}` only; an
 * admin session additionally sees {db, version, torbox, sweeper}: `db` = SQLite answers `SELECT 1` (503 when it does
 * not); `torbox` = per-process call counters (counts only — the health check never calls TorBox), `sweeper` = whether
 * the background title_sources sweeper runs.
 */
export async function GET() {
  let db = false;
  try {
    db = getDb().get<{ one: number }>(sql`select 1 as one`)?.one === 1;
  } catch (err) {
    console.error("[health] db", err instanceof Error ? err.message : err);
  }
  const me = await getSessionUser().catch(() => null);
  const body = me?.user.role === "admin" ? { ok: db, db, version: getEnv().APP_VERSION, torbox: { ...torboxStats }, sweeper: getEnv().LUMEN_SWEEPER === "1" } : { ok: db };
  return NextResponse.json(body, { status: db ? 200 : 503, headers: { "cache-control": "no-store" } });
}
