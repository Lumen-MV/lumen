import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/require-admin";
import { deleteOtherSessions, deleteSession, listSessions } from "@/lib/auth/session-service";
import { getDb, schema } from "@/lib/db/sqlite-client";
import { and, eq } from "drizzle-orm";

/** GET /api/me/sessions → [{id, deviceLabel, lastSeenAt, createdAt, current}] */
export async function GET() {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  try {
    return NextResponse.json(listSessions(me.user.id, me.sessionId));
  } catch (err) {
    console.error("[me/sessions GET]", err);
    return NextResponse.json({ code: "SERVER_ERROR" }, { status: 500 });
  }
}

/** DELETE /api/me/sessions?id=<sessionId> | ?others=1 → 204 (only the caller's own sessions) */
export async function DELETE(req: Request) {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  const url = new URL(req.url);
  try {
    if (url.searchParams.get("others") === "1") {
      deleteOtherSessions(me.user.id, me.sessionId);
      return new NextResponse(null, { status: 204 });
    }
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ code: "BAD_REQUEST" }, { status: 400 });
    const owned = getDb().select({ id: schema.sessions.id }).from(schema.sessions).where(and(eq(schema.sessions.id, id), eq(schema.sessions.userId, me.user.id))).get();
    if (!owned) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
    deleteSession(id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[me/sessions DELETE]", err);
    return NextResponse.json({ code: "SERVER_ERROR" }, { status: 500 });
  }
}
