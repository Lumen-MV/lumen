import { sealData, unsealData } from "iron-session";
import { SESSION_TTL_S, type SessionCookieData } from "./session-config";

/** Seal/unseal the cookie payload with iron-session primitives (Web Crypto → works in edge middleware). */
function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET missing or shorter than 32 chars");
  return s;
}

export function sealSessionId(sessionId: string): Promise<string> {
  return sealData({ sessionId } satisfies SessionCookieData, { password: secret(), ttl: SESSION_TTL_S });
}

/** Returns the session id or null for a missing, tampered or expired seal. */
export async function unsealSessionId(sealed: string | undefined): Promise<string | null> {
  if (!sealed) return null;
  try {
    const data = await unsealData<Partial<SessionCookieData>>(sealed, { password: secret(), ttl: SESSION_TTL_S });
    return typeof data?.sessionId === "string" && data.sessionId.length > 0 ? data.sessionId : null;
  } catch {
    return null;
  }
}
