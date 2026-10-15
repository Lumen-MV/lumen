import { NextResponse } from "next/server";
import { z } from "zod";
import { AdminActionError, deleteMember } from "@/lib/admin/admin-user-actions";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { parsePositiveInt } from "@/lib/http/catalog-route-helpers";
import { parseJsonBody } from "@/lib/http/parse-json-body";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ confirm: z.string().min(1).max(50) });

/** DELETE /api/admin/users/[id] {confirm: username} → 204 (cascade) · 400 CONFIRM_MISMATCH · 409 SELF / LAST_ADMIN · 404 */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await requireAdminApi();
  if (me instanceof NextResponse) return me;
  const id = parsePositiveInt((await ctx.params).id);
  if (id === null) return NextResponse.json({ code: "BAD_REQUEST", issues: ["id"] }, { status: 400 });
  const body = await parseJsonBody(req, bodySchema);
  if (body instanceof NextResponse) return body;
  try {
    await deleteMember({ id: me.user.id, displayName: me.user.displayName }, id, body.confirm);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof AdminActionError) return NextResponse.json({ code: err.code }, { status: err.status });
    console.error("[admin/users DELETE]", err);
    return NextResponse.json({ code: "SERVER_ERROR" }, { status: 500 });
  }
}
