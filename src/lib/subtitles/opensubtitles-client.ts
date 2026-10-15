import "server-only";
import { getEnv } from "@/lib/config/env";
import { OS_MAX_BYTES, readBodyCapped } from "./fetch-body-capped";

/**
 * OpenSubtitles REST v1 (port of spikes/stremio-addon/opensubtitles-client.js). `Api-Key` + custom User-Agent on every
 * call; `/login` (USER / PASS) only before downloads, JWT cached 23 h and re-logged on 401. `fetch` is injectable for
 * tests (recorded fixtures); nothing here ever logs a key or a token. File downloads are capped at 4 MiB.
 */
const BASE = "https://api.opensubtitles.com/api/v1";
const UA = "Lumen v1.0";
const LOGIN_TTL_MS = 23 * 3_600_000;
const TIMEOUT_MS = 8000;

export type OsSearchHit = { id: string; lang: string; release: string; downloads: number; aiTranslated: boolean; machineTranslated: boolean; hearingImpaired: boolean; fps: number | null; fileId: number | null; fileName: string };
export type OsDownload = { bytes: Uint8Array; remaining: number | null; resetTime: string | null; fileName: string };
export type OsSearchQuery = { imdbId?: string | null; parentImdbId?: string | null; season?: number; episode?: number; languages?: string };

export class OpenSubtitlesError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "OpenSubtitlesError";
  }
}
export const isOsQuotaError = (err: unknown): boolean => err instanceof OpenSubtitlesError && (err.status === 406 || err.status === 429);

type Session = { token: string; baseUrl: string; exp: number };
const g = globalThis as unknown as { __hcOsSession?: Session | null };
let fetchImpl: typeof fetch = (...a) => fetch(...a);
/** tests: swap the transport */
export const setOsFetch = (f: typeof fetch | null) => void (fetchImpl = f ?? ((...a) => fetch(...a)));

const headers = (extra: Record<string, string> = {}) => ({ "Api-Key": getEnv().OPENSUBTITLES_API_KEY, "User-Agent": UA, "Content-Type": "application/json", Accept: "application/json", ...extra });
const numericImdb = (id: string) => id.replace(/^tt/, "");

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

async function login(force = false): Promise<Session> {
  const cur = g.__hcOsSession;
  if (!force && cur && cur.exp > Date.now()) return cur;
  const env = getEnv();
  if (!env.OPENSUBTITLES_USER || !env.OPENSUBTITLES_PASS) throw new OpenSubtitlesError("OpenSubtitles credentials missing", 0);
  const res = await fetchImpl(`${BASE}/login`, { method: "POST", headers: headers(), body: JSON.stringify({ username: env.OPENSUBTITLES_USER, password: env.OPENSUBTITLES_PASS }), signal: AbortSignal.timeout(TIMEOUT_MS) });
  const body = await readJson(res);
  if (!res.ok || typeof body.token !== "string") throw new OpenSubtitlesError(`OpenSubtitles login ${res.status}`, res.status);
  const host = typeof body.base_url === "string" && body.base_url ? `https://${body.base_url}/api/v1` : BASE;
  const session = { token: body.token, baseUrl: host, exp: Date.now() + LOGIN_TTL_MS };
  g.__hcOsSession = session;
  return session;
}

/** Movies by `imdb_id`; episodes by `parent_imdb_id` + season + episode. Sorted by download count by the API. */
export async function osSearch(q: OsSearchQuery): Promise<OsSearchHit[]> {
  if (!getEnv().OPENSUBTITLES_API_KEY) return [];
  const params = new URLSearchParams({ languages: q.languages ?? "vi,en", order_by: "download_count", order_direction: "desc" });
  if (q.parentImdbId && q.season !== undefined && q.episode !== undefined) {
    params.set("parent_imdb_id", numericImdb(q.parentImdbId));
    params.set("season_number", String(q.season));
    params.set("episode_number", String(q.episode));
  } else if (q.imdbId) params.set("imdb_id", numericImdb(q.imdbId));
  else return [];
  const res = await fetchImpl(`${BASE}/subtitles?${params}`, { headers: headers(), signal: AbortSignal.timeout(TIMEOUT_MS) });
  const body = await readJson(res);
  if (!res.ok) throw new OpenSubtitlesError(`OpenSubtitles search ${res.status}`, res.status);
  const data = Array.isArray(body.data) ? (body.data as Array<{ id: string; attributes: Record<string, unknown> }>) : [];
  return data.map((d) => {
    const a = d.attributes ?? {};
    const file = (Array.isArray(a.files) ? a.files[0] : null) as { file_id?: number; file_name?: string } | null;
    return { id: String(d.id), lang: String(a.language ?? ""), release: String(a.release ?? ""), downloads: Number(a.download_count ?? 0), aiTranslated: Boolean(a.ai_translated), machineTranslated: Boolean(a.machine_translated), hearingImpaired: Boolean(a.hearing_impaired), fps: typeof a.fps === "number" ? a.fps : null, fileId: typeof file?.file_id === "number" ? file.file_id : null, fileName: String(file?.file_name ?? "") };
  });
}

/** `POST /download {file_id}` → link + quota counters → the SRT bytes (decoded by the caller). 401 → re-login once. */
export async function osDownload(fileId: number, retried = false): Promise<OsDownload> {
  const s = await login(retried);
  const res = await fetchImpl(`${s.baseUrl}/download`, { method: "POST", headers: headers({ Authorization: `Bearer ${s.token}` }), body: JSON.stringify({ file_id: fileId, sub_format: "srt" }), signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 401 && !retried) return osDownload(fileId, true);
  const body = await readJson(res);
  if (!res.ok || typeof body.link !== "string") throw new OpenSubtitlesError(`OpenSubtitles download ${res.status}`, res.status);
  const file = await fetchImpl(body.link, { signal: AbortSignal.timeout(TIMEOUT_MS * 2) });
  if (!file.ok) throw new OpenSubtitlesError(`OpenSubtitles file ${file.status}`, file.status);
  // `reset_time` is prose ("14 hours and 19 minutes"); `reset_time_utc` is the ISO instant
  const resetTime = typeof body.reset_time_utc === "string" ? body.reset_time_utc : typeof body.reset_time === "string" ? body.reset_time : null;
  return { bytes: await readBodyCapped(file, OS_MAX_BYTES), remaining: typeof body.remaining === "number" ? body.remaining : null, resetTime, fileName: String(body.file_name ?? "") };
}
