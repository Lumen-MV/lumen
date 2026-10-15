import "server-only";
import { NextResponse } from "next/server";
import { resolveDeviceToken, type ResolvedDevice } from "@/lib/auth/device-token";
import { looksLikeToken } from "@/lib/auth/invite-token";
import { getEnv } from "@/lib/config/env";
import { STREMIO_RATE_WINDOW_MS, stremioRateLimited, type StremioRateScope } from "./stremio-rate-limit";
import { parseStremioId, toMediaType, type ParsedStremioId, type StremioType } from "./stremio-ids";
import { tmdbIdForImdb } from "./stremio-meta-builder";

/**
 * Shared by every /stremio/[token]/* route: CORS (`*` — Stremio Web calls from its own origin), no-store, the device
 * token guard (unknown / revoked → 404 JSON, never a redirect to /login; 429 past the per-token limit) and the public
 * base URL (always APP_URL — a forwarded Host must never shape the manifest / stream URLs).
 */
export const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET, HEAD, OPTIONS" } as const;

export const stremioJson = (body: unknown, status = 200): NextResponse => NextResponse.json(body, { status, headers: { ...CORS, "cache-control": "no-store" } });
export const stremioNotFound = (): NextResponse => stremioJson({ error: "not found" }, 404);
export const stremioOptions = (): NextResponse => new NextResponse(null, { status: 204, headers: CORS });

/** Shape check → per-token rate limit (`scope`: 60/min general, 10/min play; `null` = exempt) → DB lookup. */
export function stremioDevice(token: string, scope: StremioRateScope | null = "general"): ResolvedDevice | NextResponse {
  if (!looksLikeToken(token)) return stremioNotFound();
  if (scope && stremioRateLimited(token, scope)) return NextResponse.json({ error: "rate limited" }, { status: 429, headers: { ...CORS, "cache-control": "no-store", "retry-after": String(STREMIO_RATE_WINDOW_MS / 1000) } });
  return resolveDeviceToken(token) ?? stremioNotFound();
}

export function publicBaseUrl(): string {
  return getEnv().APP_URL.replace(/\/$/, "");
}

export const isStremioType = (t: string): t is StremioType => t === "movie" || t === "series";

/** Last path segment = `<id>.json`; `tt` ids are mapped to TMDB once (cached). Null when unknown. */
export async function resolveStremioId(type: StremioType, rest: string[]): Promise<Extract<ParsedStremioId, { kind: "tmdb" }> | null> {
  const parsed = parseStremioId(rest[0] ?? "");
  if (!parsed) return null;
  if (parsed.kind === "tmdb") return parsed.type === toMediaType(type) ? parsed : null;
  const tmdbId = await tmdbIdForImdb(parsed.imdbId, type).catch(() => null);
  return tmdbId ? { kind: "tmdb", type: toMediaType(type), tmdbId, season: parsed.season, episode: parsed.episode } : null;
}
