import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/lib/http/parse-json-body";
import { DUMMY_PASSWORD_HASH, findUserByUsername, toPublicUser, verifyPassword } from "@/lib/users/user-service";
import { loginBlockedForS, recordLoginFailure, resetLoginFailures } from "@/lib/auth/login-rate-limit";
import { clientIp, createSession, pruneExpiredSessions } from "@/lib/auth/session-service";
import { setSessionCookie } from "@/lib/auth/session-cookie";
import { logActivity } from "@/lib/activity/log-activity";
import { isTempPasswordExpired } from "@/lib/admin/temp-password";
import { copy } from "@/lib/copy-vi";

const bodySchema = z.object({ username: z.string().min(1).max(50), password: z.string().min(1).max(200), remember: z.boolean().optional().default(true) });

/**
 * POST /api/auth/login → 200 {user} | 401 AUTH_INVALID | 401 AUTH_TEMP_EXPIRED (temp password older than 48 h) | 403 AUTH_DISABLED | 429 AUTH_RATE {retryAfterS}
 */
export async function POST(req: Request) {
  const body = await parseJsonBody(req, bodySchema);
  if (body instanceof NextResponse) return body;
  const ip = clientIp(req);

  const wait = loginBlockedForS(ip);
  if (wait > 0) return NextResponse.json({ code: "AUTH_RATE", retryAfterS: wait }, { status: 429, headers: { "Retry-After": String(wait) } });

  try {
    const user = findUserByUsername(body.username);
    // always run bcrypt (dummy hash for unknown users) so response time does not reveal whether the username exists
    const ok = await verifyPassword(body.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !ok) {
      recordLoginFailure(ip);
      const nowBlocked = loginBlockedForS(ip);
      if (nowBlocked > 0) return NextResponse.json({ code: "AUTH_RATE", retryAfterS: nowBlocked }, { status: 429 });
      return NextResponse.json({ code: "AUTH_INVALID" }, { status: 401 });
    }
    if (user.disabled) return NextResponse.json({ code: "AUTH_DISABLED" }, { status: 403 });
    if (isTempPasswordExpired(user)) return NextResponse.json({ code: "AUTH_TEMP_EXPIRED" }, { status: 401 });

    resetLoginFailures(ip);
    pruneExpiredSessions();
    const sessionId = createSession(user.id, req, body.remember);
    await setSessionCookie(sessionId, body.remember);
    logActivity("login", copy.activity.login(user.displayName), user.id);
    return NextResponse.json({ user: toPublicUser(user) });
  } catch (err) {
    console.error("[auth/login]", err);
    return NextResponse.json({ code: "SERVER_ERROR" }, { status: 500 });
  }
}
