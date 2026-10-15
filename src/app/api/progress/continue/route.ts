import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/require-admin";
import { listContinue } from "@/lib/progress/continue-list";

export const dynamic = "force-dynamic";

/** GET /api/progress/continue → {items: ContinueItem[]} (newest first, one per title, in-progress only). */
export async function GET() {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  try {
    return NextResponse.json({ items: await listContinue(me.user.id) }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[progress/continue]", err);
    return NextResponse.json({ code: "SERVER_ERROR" }, { status: 500 });
  }
}
