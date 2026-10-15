import "server-only";
import { getEnv } from "@/lib/config/env";
import { decodeSubtitle } from "./encoding-detect";
import { readBodyCapped, SUBDL_MAX_BYTES } from "./fetch-body-capped";
import { unzip, type ZipEntry } from "./zip-extract";

/**
 * SubDL (api.subdl.com, port of spikes/stremio-addon/subdl-client.js): API-key search per language (uppercase codes,
 * ≤ 10 results per call) and ZIP downloads from dl.subdl.com that hold `.srt` or `.ass` files — season packs carry one
 * file per episode, picked by SxxExx. Downloads are capped at 8 MiB and only subtitle entries are inflated.
 * `fetch` is injectable for tests.
 */
const API = "https://api.subdl.com/api/v1/subtitles";
const DL = "https://dl.subdl.com";
const TIMEOUT_MS = 8000;

export type SubdlHit = { name: string; lang: string; url: string; author: string; hearingImpaired: boolean; season: number | null; episode: number | null };
export type SubdlQuery = { imdbId: string; type: "movie" | "tv"; season?: number; episode?: number; languages?: string };

export class SubdlError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "SubdlError";
  }
}

let fetchImpl: typeof fetch = (...a) => fetch(...a);
export const setSubdlFetch = (f: typeof fetch | null) => void (fetchImpl = f ?? ((...a) => fetch(...a)));

export async function subdlSearch(q: SubdlQuery): Promise<SubdlHit[]> {
  const key = getEnv().SUBDL_API_KEY;
  if (!key) return [];
  const params = new URLSearchParams({ api_key: key, imdb_id: q.imdbId, languages: q.languages ?? "VI,EN", type: q.type });
  if (q.season !== undefined) params.set("season_number", String(q.season));
  if (q.episode !== undefined) params.set("episode_number", String(q.episode));
  const res = await fetchImpl(`${API}?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || body.status === false) throw new SubdlError(`SubDL search ${res.status}`, res.status);
  const subs = Array.isArray(body.subtitles) ? (body.subtitles as Array<Record<string, unknown>>) : [];
  return subs
    .filter((s) => typeof s.url === "string")
    .map((s) => ({ name: String(s.release_name ?? s.name ?? ""), lang: String(s.lang ?? s.language ?? "").toLowerCase(), url: String(s.url), author: String(s.author ?? ""), hearingImpaired: Boolean(s.hi), season: typeof s.season === "number" ? s.season : null, episode: typeof s.episode === "number" ? s.episode : null }));
}

export const isSubFile = (n: string) => /\.(srt|ass|ssa)$/i.test(n) && !/__MACOSX|^\./.test(n);
const epTag = (s: number, e: number) => new RegExp(`s0*${s}e0*${e}(?!\\d)`, "i");

/** `.srt` beats `.ass`; inside a pack the SxxExx file wins, else the first subtitle file. */
export function pickZipEntry(entries: ZipEntry[], season?: number, episode?: number): ZipEntry | null {
  const subs = entries.filter((e) => isSubFile(e.name));
  const pool = season !== undefined && episode !== undefined ? subs.filter((e) => epTag(season, episode).test(e.name)) : subs;
  const from = pool.length ? pool : subs;
  return from.find((e) => /\.srt$/i.test(e.name)) ?? from[0] ?? null;
}

export async function subdlDownload(url: string, season?: number, episode?: number): Promise<{ fileName: string; text: string }> {
  const res = await fetchImpl(`${DL}${url.startsWith("/") ? url : `/${url}`}`, { signal: AbortSignal.timeout(TIMEOUT_MS * 2) });
  if (!res.ok) throw new SubdlError(`SubDL download ${res.status}`, res.status);
  const entry = pickZipEntry(unzip(await readBodyCapped(res, SUBDL_MAX_BYTES), { filter: isSubFile }), season, episode);
  if (!entry) throw new SubdlError("SubDL zip without .srt/.ass", 0);
  return { fileName: entry.name.split("/").pop() ?? entry.name, text: decodeSubtitle(entry.bytes) };
}
