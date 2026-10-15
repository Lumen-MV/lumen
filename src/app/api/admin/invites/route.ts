import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { parseJsonBody } from "@/lib/http/parse-json-body";
import { createInvite, listInvites } from "@/lib/invites/invite-service";
import { logActivity } from "@/lib/activity/log-activity";
import { copy } from "@/lib/copy-vi";

const bodySchema = z.object({ note: z.string().max(80).optional().default(""), expiresDays: z.union([z.literal(3), z.literal(7), z.literal(14)]).optional().default(7), maxUses: z.union([z.literal(1), z.null()]).optional().default(1) });

/** POST /api/admin/invites {note, expiresDays, maxUses} → {id, url, expiresAt} (admin only) */
export async function POST(req: Request) {
  const me = await requireAdminApi();
  if (me instanceof NextResponse) return me;
  const body = await parseJsonBody(req, bodySchema);
  if (body instanceof NextResponse) return body;
  try {
    const inv = createInvite({ createdBy: me.user.id, note: body.note, expiresDays: body.expiresDays, maxUses: body.maxUses });
    logActivity("invite", copy.activity.inviteCreated(me.user.displayName, body.note), me.user.id);
    return NextResponse.json({ id: inv.id, url: inv.url, expiresAt: inv.expiresAt });
  } catch (err) {
    console.error("[admin/invites POST]", err);
    return NextResponse.json({ code: "SERVER_ERROR" }, { status: 500 });
  }
}

/** GET /api/admin/invites → list with computed state (admin only) */
export async function GET() {
  const me = await requireAdminApi();
  if (me instanceof NextResponse) return me;
  try {
    return NextResponse.json({ invites: listInvites() });
  } catch (err) {
    console.error("[admin/invites GET]", err);
    return NextResponse.json({ code: "SERVER_ERROR" }, { status: 500 });
  }
}
