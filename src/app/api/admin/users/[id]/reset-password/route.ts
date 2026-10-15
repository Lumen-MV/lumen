import { NextResponse } from "next/server";
import { AdminActionError, resetMemberPassword } from "@/lib/admin/admin-user-actions";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { parsePositiveInt } from "@/lib/http/catalog-route-helpers";

export const dynamic = "force-dynamic";

/** POST /api/admin/users/[id]/reset-password → {tempPassword, user} (shown once; member must change it at next login). */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await requireAdminApi();
  if (me instanceof NextResponse) return me;
  const id = parsePositiveInt((await ctx.params).id);
  if (id === null) return NextResponse.json({ code: "BAD_REQUEST", issues: ["id"] }, { status: 400 });
  try {
    return NextResponse.json(await resetMemberPassword({ id: me.user.id, displayName: me.user.displayName }, id), { headers: { "cache-control": "no-store" } });
  } catch (err) {
    if (err instanceof AdminActionError) return NextResponse.json({ code: err.code }, { status: err.status });
    console.error("[admin/users reset-password]", err);
    return NextResponse.json({ code: "SERVER_ERROR" }, { status: 500 });
  }
}
