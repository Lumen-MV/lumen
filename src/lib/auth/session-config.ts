/** Shared session-cookie constants. Edge-safe (no Node imports) so middleware can use them. */
export const SESSION_COOKIE = "lumen_session";
export const SESSION_TTL_S = 30 * 24 * 60 * 60; // 30 days (remember me) — cookie maxAge and server-side idle limit
export const SESSION_IDLE_TTL_S = 24 * 60 * 60; // 24 h since last activity for browser-session logins (remember=false)
export const SCENARIO_COOKIE = "lumen_scenario";

export type SessionCookieData = { sessionId: string };

export function sessionCookieOptions(remember: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // remember → 30-day cookie; otherwise a browser-session cookie (no maxAge)
    ...(remember ? { maxAge: SESSION_TTL_S } : {}),
  };
}
