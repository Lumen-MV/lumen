import { NextResponse } from "next/server";
import { devScenariosEnabled } from "@/lib/config/env";
import { parseJsonBody } from "@/lib/http/parse-json-body";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { applyFixture, fixtureSchema } from "@/lib/dev/fixtures";

/**
 * POST /api/dev/seed {fixture:…} → seeds real rows for screenshot states.
 * 404 unless LUMEN_SCENARIOS=1 (never in production); then admin session required (dev binds 0.0.0.0, so LAN hosts must not seed).
 */
export async function POST(req: Request) {
  if (!devScenariosEnabled()) return new NextResponse(null, { status: 404 });
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;
  const body = await parseJsonBody(req, fixtureSchema);
  if (body instanceof NextResponse) return body;
  try {
    return NextResponse.json(await applyFixture(body));
  } catch (err) {
    console.error("[dev/seed]", err);
    return NextResponse.json({ code: "SERVER_ERROR", message: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
