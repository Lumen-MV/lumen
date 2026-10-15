import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserApi } from "@/lib/auth/require-admin";
import { parseJsonBody } from "@/lib/http/parse-json-body";
import { listNotifications, markNotificationsRead } from "@/lib/notifications/notifications-service";

const patchSchema = z.union([z.object({ all: z.literal(true) }), z.object({ id: z.number().int().positive() })]);

/** GET /api/notifications → {items:[{id,type,icon,html,timeAgo,href,read}], unread} */
export async function GET() {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  try {
    return NextResponse.json(listNotifications(me.user.id, me.user.role));
  } catch (err) {
    console.error("[notifications]", err);
    return NextResponse.json({ code: "SERVER_ERROR" }, { status: 500 });
  }
}

/** PATCH /api/notifications {all:true} | {id} → {unread} */
export async function PATCH(req: Request) {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  const body = await parseJsonBody(req, patchSchema);
  if (body instanceof NextResponse) return body;
  try {
    return NextResponse.json({ unread: markNotificationsRead(me.user.id, body) });
  } catch (err) {
    console.error("[notifications]", err);
    return NextResponse.json({ code: "SERVER_ERROR" }, { status: 500 });
  }
}
