import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/lib/http/parse-json-body";
import { acceptInvite, InviteError } from "@/lib/invites/accept-invite";
import { createSession } from "@/lib/auth/session-service";
import { setSessionCookie } from "@/lib/auth/session-cookie";
import { toPublicUser } from "@/lib/users/user-service";

const bodySchema = z.object({ token: z.string().min(1).max(100), displayName: z.string().min(1).max(40), username: z.string().min(1).max(30), password: z.string().min(1).max(200) });

/**
 * POST /api/auth/accept-invite → 200 {user} (logged in, 30-day session)
 * | 409 USERNAME_TAKEN {suggestions} | 410 INVITE_USED|INVITE_EXPIRED | 404 INVITE_INVALID | 400 WEAK_PASSWORD|BAD_USERNAME
 */
export async function POST(req: Request) {
  const body = await parseJsonBody(req, bodySchema);
  if (body instanceof NextResponse) return body;
  try {
    const user = await acceptInvite(body);
    const sessionId = createSession(user.id, req, true);
    await setSessionCookie(sessionId, true);
    return NextResponse.json({ user: toPublicUser(user) });
  } catch (err) {
    if (err instanceof InviteError) return NextResponse.json({ code: err.code, ...err.extra }, { status: err.status });
    console.error("[auth/accept-invite]", err);
    return NextResponse.json({ code: "SERVER_ERROR" }, { status: 500 });
  }
}
