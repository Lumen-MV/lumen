import { createHmac, timingSafeEqual } from "node:crypto";
import { slidingWindowLimited, type RateBuckets } from "@/lib/http/sliding-window-rate-limit";

/**
 * Session-less subtitle links for the hand-off apps (Infuse / VLC cannot send our cookie), PATH-style so the file
 * extension is the LAST thing in the URL and there is no query string at all:
 * `/api/subs/s/{id}/{exp}/{sig}/subtitle.srt` (or `.vtt`), `sig = hmac-sha256(SESSION_SECRET, "{id}|{exp}")`.
 * Players sniff the subtitle format from the URL's extension (VLC `demux_IsPathExtension` compares everything after
 * the last `.`, so `7.vtt?exp=…&sig=…` never matches) and a value without `?`/`&`/`=` survives even a sloppy
 * x-callback-url parser. Valid ≤ 60 min, no user data, constant-time compare; bad / expired → the route answers 404
 * (never a hint which part failed). Pure helpers take the secret so the unit tests run without env.
 */
export const SIGNED_SUB_TTL_S = 60 * 60;
export const SIGNED_SUB_RATE_LIMIT = 60;
const SIGNED_SUB_RATE_WINDOW_MS = 60_000;

export type SignedSubtitleFormat = "srt" | "vtt";
export const SIGNED_SUB_PREFIX = "/api/subs/s/";

export const subtitleSig = (id: number, exp: number, secret: string): string => createHmac("sha256", secret).update(`${id}|${exp}`).digest("hex");

/** `/api/subs/s/{id}/{exp}/{sig}/subtitle.{format}` for `id`, expiring `SIGNED_SUB_TTL_S` after `nowMs` (the caller prefixes APP_URL). */
export function signedSubtitlePath(id: number, format: SignedSubtitleFormat, secret: string, nowMs = Date.now()): string {
  const exp = Math.floor(nowMs / 1000) + SIGNED_SUB_TTL_S;
  return `${SIGNED_SUB_PREFIX}${id}/${exp}/${subtitleSig(id, exp, secret)}/subtitle.${format}`;
}

/** True only for a well-formed, unexpired signature over exactly this id (exp in the future, never beyond the TTL). */
export function verifySubtitleSig(id: number, expRaw: string | null, sigRaw: string | null, secret: string, nowMs = Date.now()): boolean {
  if (!expRaw || !sigRaw || !/^\d{1,12}$/.test(expRaw) || !/^[0-9a-f]{64}$/.test(sigRaw)) return false;
  const exp = Number(expRaw);
  const nowS = Math.floor(nowMs / 1000);
  if (exp <= nowS || exp > nowS + SIGNED_SUB_TTL_S) return false;
  const expected = Buffer.from(subtitleSig(id, exp, secret), "hex");
  const given = Buffer.from(sigRaw, "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** The file segment → format, or null for anything but `subtitle.srt` / `subtitle.vtt`. */
export function signedSubtitleFormat(file: string): SignedSubtitleFormat | null {
  return file === "subtitle.srt" ? "srt" : file === "subtitle.vtt" ? "vtt" : null;
}

const g = globalThis as unknown as { __hcSignedSubRate?: RateBuckets };
const buckets = (): RateBuckets => (g.__hcSignedSubRate ??= new Map());

/** 60 signed fetches / minute / client IP ("unknown" = one shared bucket without TRUST_PROXY). */
export function signedSubtitleRateLimited(ip: string, now = Date.now()): boolean {
  return slidingWindowLimited(buckets(), ip, SIGNED_SUB_RATE_LIMIT, SIGNED_SUB_RATE_WINDOW_MS, now);
}

/** Dev fixture hook (`reset-rate-limit`). */
export function clearSignedSubtitleRateBuckets(): void {
  buckets().clear();
}
