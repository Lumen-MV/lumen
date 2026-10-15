import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserApi } from "@/lib/auth/require-admin";
import { parseJsonBody } from "@/lib/http/parse-json-body";
import { changePassword } from "@/lib/users/profile-service";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ current: z.string().min(1).max(200), next: z.string().min(1).max(200) });

/** POST /api/me/password {current, next} → 204 (every other session of the user is deleted) · 400 {code:'PW_WRONG'} · 400 {code:'WEAK_PASSWORD'} */
export async function POST(req: Request) {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  const body = await parseJsonBody(req, bodySchema);
  if (body instanceof NextResponse) return body;
  try {
    const result = await changePassword(me.user.id, body.current, body.next, me.sessionId);
    if (result === "ok") return new NextResponse(null, { status: 204 });
    if (result === "NOT_FOUND") return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
    return NextResponse.json({ code: result }, { status: 400 });
  } catch (err) {
    console.error("[me/password]", err);
    return NextResponse.json({ code: "SERVER_ERROR" }, { status: 500 });
  }
}
