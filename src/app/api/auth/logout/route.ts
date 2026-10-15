import { NextResponse } from "next/server";
import { readSessionIdFromCookies, clearSessionCookie } from "@/lib/auth/session-cookie";
import { deleteSession } from "@/lib/auth/session-service";

/** POST /api/auth/logout → 204; deletes the session row and clears the cookie. */
export async function POST() {
  try {
    const sessionId = await readSessionIdFromCookies();
    if (sessionId) deleteSession(sessionId);
    await clearSessionCookie();
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[auth/logout]", err);
    return NextResponse.json({ code: "SERVER_ERROR" }, { status: 500 });
  }
}
