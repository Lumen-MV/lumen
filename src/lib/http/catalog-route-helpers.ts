import { NextResponse } from "next/server";
import { isTmdbNotFound, TmdbError } from "@/lib/tmdb/tmdb-client";

/** Uniform error mapping for /api/catalog/*: TMDB 404 → 404 NOT_FOUND, any other TMDB failure → 502 TMDB_DOWN, else 500. */
export function catalogErrorResponse(scope: string, err: unknown): NextResponse {
  if (isTmdbNotFound(err)) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  console.error(`[${scope}]`, err instanceof Error ? err.message : err);
  if (err instanceof TmdbError) return NextResponse.json({ code: "TMDB_DOWN" }, { status: 502 });
  return NextResponse.json({ code: "SERVER_ERROR" }, { status: 500 });
}

/** Positive integer route/query param or null (TMDB ids fit in 9 digits, same bound as media-key). */
export function parsePositiveInt(raw: string | null | undefined, max = 999_999_999): number | null {
  if (raw === null || raw === undefined || !/^\d{1,9}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 && n <= max ? n : null;
}
