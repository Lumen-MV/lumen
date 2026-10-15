import { NextResponse } from "next/server";
import { logActivity } from "@/lib/activity/log-activity";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { copy } from "@/lib/copy-vi";
import { parsePositiveInt } from "@/lib/http/catalog-route-helpers";
import { recreateInvite, revokeInvite } from "@/lib/invites/invite-service";

export const dynamic = "force-dynamic";

/** DELETE /api/admin/invites/[id] → "Huỷ": 204 (idempotent) · 404 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await requireAdminApi();
  if (me instanceof NextResponse) return me;
  const id = parsePositiveInt((await ctx.params).id);
  if (id === null) return NextResponse.json({ code: "BAD_REQUEST", issues: ["id"] }, { status: 400 });
  try {
    const row = revokeInvite(id);
    if (!row) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
    logActivity("invite", copy.activity.inviteRevoked(me.user.displayName, row.note), me.user.id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[admin/invites DELETE]", err);
    return NextResponse.json({ code: "SERVER_ERROR" }, { status: 500 });
  }
}

/** POST /api/admin/invites/[id] → "Tạo lại": {id, url, expiresAt, note, maxUses} (fresh 7-day invite, same note) · 404 · 409 STILL_VALID while the old link still works */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await requireAdminApi();
  if (me instanceof NextResponse) return me;
  const id = parsePositiveInt((await ctx.params).id);
  if (id === null) return NextResponse.json({ code: "BAD_REQUEST", issues: ["id"] }, { status: 400 });
  try {
    const inv = recreateInvite(id, me.user.id);
    if (!inv) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
    if (inv === "STILL_VALID") return NextResponse.json({ code: "STILL_VALID" }, { status: 409 });
    logActivity("invite", copy.activity.inviteCreated(me.user.displayName, inv.note), me.user.id);
    return NextResponse.json({ id: inv.id, url: inv.url, expiresAt: inv.expiresAt, note: inv.note, maxUses: inv.maxUses });
  } catch (err) {
    console.error("[admin/invites POST recreate]", err);
    return NextResponse.json({ code: "SERVER_ERROR" }, { status: 500 });
  }
}
