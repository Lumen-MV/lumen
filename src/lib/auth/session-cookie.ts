import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, sessionCookieOptions } from "./session-config";
import { sealSessionId, unsealSessionId } from "./session-seal";

/** Server-side cookie helpers (route handlers / server components only). */
export async function setSessionCookie(sessionId: string, remember: boolean): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await sealSessionId(sessionId), sessionCookieOptions(remember));
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { ...sessionCookieOptions(true), maxAge: 0 });
}

export async function readSessionIdFromCookies(): Promise<string | null> {
  const jar = await cookies();
  return unsealSessionId(jar.get(SESSION_COOKIE)?.value);
}
