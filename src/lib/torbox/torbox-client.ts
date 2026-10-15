import "server-only";
import { getEnv } from "@/lib/config/env";
import { currentScenario } from "@/lib/dev/scenario-flags-server";
import type { TorboxCachedEntry, TorboxCreateResult, TorboxEnvelope, TorboxTorrent } from "./torbox-types";

/**
 * Typed TorBox v1 client (server-only; the key never leaves this module graph). Six calls: checkCached, createTorrent,
 * getTorrent, listTorrents, requestDownloadLink, controlTorrent (delete). One retry on 429 honouring Retry-After, two
 * retries with jitter on 5xx; `x-ratelimit-remaining` is logged when it gets low. Every TorboxError field is token-free
 * (the `requestdl` query carries the key). Dev scenario `torbox-down` (request cookie) makes every call throw.
 */
const BASE = "https://api.torbox.app/v1/api";
const TIMEOUT_MS = 15_000;
const RETRY_AFTER_CAP_MS = 5000;
const LOW_REMAINING = 30;
const MAX_5XX_RETRIES = 2;

/** `?token=<key>` → `?token=***` — applied to every string stored on a TorboxError or logged. */
export const redactToken = (text: string): string => text.replace(/token=[^&\s"']*/gi, "token=***");

export class TorboxError extends Error {
  public readonly detail: string;
  /** endpoint path WITHOUT its query string (never the key) */
  public readonly path: string;
  constructor(message: string, public readonly status: number, detail: string, path: string) {
    super(redactToken(message));
    this.name = "TorboxError";
    this.detail = redactToken(detail);
    this.path = path.split("?")[0];
  }
}
export const isTorboxUnreachable = (err: unknown): boolean => err instanceof TorboxError && (err.status === 0 || err.status >= 500 || err.status === 429 || err.status === 503);
/** TorBox no longer has the torrent (deleted / expired) → the caller drops its torrent_cache row and re-adds. */
export const isTorrentGone = (err: unknown): boolean => err instanceof TorboxError && (err.status === 404 || (err.status < 500 && /not found|no torrent|does not exist|invalid torrent/i.test(err.detail)));

/** Per-process counters (counts only — exposed by /api/health as `torbox`); on globalThis so a dev recompile keeps the budget count. */
type TorboxStats = { calls: number; retries: number; errors: number; lastRemaining: number | null };
const g = globalThis as unknown as { __hcTorboxStats?: TorboxStats };
export const torboxStats: TorboxStats = (g.__hcTorboxStats ??= { calls: 0, retries: 0, errors: 0, lastRemaining: null });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call<T>(path: string, init: RequestInit = {}, attempt = 0): Promise<T> {
  const endpoint = path.split("?")[0];
  const scenario = await currentScenario();
  if (scenario.has("torbox-down")) throw new TorboxError("scenario torbox-down", 503, "scenario", endpoint);
  const key = getEnv().TORBOX_API_KEY;
  if (!key) throw new TorboxError("TORBOX_API_KEY missing", 0, "no key", endpoint);
  torboxStats.calls++;
  if (attempt > 0) torboxStats.retries++;
  let res: Response;
  try {
    res = await fetch(BASE + path, { ...init, headers: { Authorization: `Bearer ${key}`, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch (err) {
    torboxStats.errors++;
    throw new TorboxError(`TorBox unreachable ${endpoint}: ${err instanceof Error ? err.name : "error"}`, 0, "network", endpoint);
  }
  const remaining = Number(res.headers.get("x-ratelimit-remaining"));
  if (Number.isFinite(remaining)) {
    torboxStats.lastRemaining = remaining;
    if (remaining < LOW_REMAINING) console.warn(`[torbox] rate limit remaining ${remaining}`);
  }
  if (res.status === 429 && attempt === 0) {
    const retryAfterS = Number(res.headers.get("retry-after") ?? "1");
    await sleep(Math.min(RETRY_AFTER_CAP_MS, Math.max(500, (Number.isFinite(retryAfterS) ? retryAfterS : 1) * 1000)));
    return call<T>(path, init, attempt + 1);
  }
  if (res.status >= 500 && attempt < MAX_5XX_RETRIES) {
    await sleep(500 * 2 ** attempt + Math.round(Math.random() * 300));
    return call<T>(path, init, attempt + 1);
  }
  const body = (await res.json().catch(() => ({}))) as Partial<TorboxEnvelope<T>>;
  if (!res.ok || body.success === false) {
    torboxStats.errors++;
    const detail = String(body.detail ?? body.error ?? "unknown");
    throw new TorboxError(`TorBox ${res.status} ${endpoint}: ${detail}`, res.status, detail, endpoint);
  }
  return body.data as T;
}

/** ≤ 100 hashes per request; returns only the cached ones (with their file lists). Hashes must be lowercase 40-hex. */
export async function checkCached(hashes: string[]): Promise<Map<string, TorboxCachedEntry>> {
  const out = new Map<string, TorboxCachedEntry>();
  for (let i = 0; i < hashes.length; i += 100) {
    const batch = hashes.slice(i, i + 100);
    const data = await call<TorboxCachedEntry[] | Record<string, TorboxCachedEntry> | null>("/torrents/checkcached?format=list&list_files=true", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hashes: batch }),
    });
    const list = Array.isArray(data) ? data : data ? Object.values(data) : [];
    for (const t of list) if (t?.hash) out.set(String(t.hash).toLowerCase(), t);
  }
  return out;
}

/** `add_only_if_cached=true` = instant path (fails with a detail instead of starting a slow download). */
export async function createTorrent(magnet: string, opts: { addOnlyIfCached: boolean }): Promise<TorboxCreateResult> {
  const form = new FormData();
  form.set("magnet", magnet);
  form.set("seed", "1");
  form.set("allow_zip", "false");
  form.set("add_only_if_cached", String(opts.addOnlyIfCached));
  return call<TorboxCreateResult>("/torrents/createtorrent", { method: "POST", body: form });
}

export function getTorrent(torrentId: number): Promise<TorboxTorrent | null> {
  return call<TorboxTorrent | null>(`/torrents/mylist?id=${torrentId}&bypass_cache=true`);
}

/** Whole list (≤ 1000) — only to find a TorBox-queued job once it starts (its id is unknown until then); the poller throttles it. */
export async function listTorrents(): Promise<TorboxTorrent[]> {
  const data = await call<TorboxTorrent[] | null>("/torrents/mylist?bypass_cache=false&limit=1000");
  return Array.isArray(data) ? data : [];
}

/** CDN URL (~1 h to start; Range OK). The URL embeds the API key → must only ever live in the server-side stream registry. */
export function requestDownloadLink(torrentId: number, fileId: number, userIp?: string): Promise<string> {
  const q = new URLSearchParams({ token: getEnv().TORBOX_API_KEY, torrent_id: String(torrentId), file_id: String(fileId), redirect: "false" });
  if (userIp) q.set("user_ip", userIp);
  return call<string>(`/torrents/requestdl?${q}`);
}

export function controlTorrent(torrentId: number, operation: "delete" | "pause" | "resume" | "reannounce"): Promise<unknown> {
  return call<unknown>("/torrents/controltorrent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operation, torrent_id: torrentId }) });
}

/** `/user/me` (plan id: 0 Free · 1 Essential · 2 Pro · 3 Standard) — only the admin KPI, memoised in torbox-plan.ts. */
export function getMe(): Promise<{ plan?: number; email?: string } | null> {
  return call<{ plan?: number; email?: string } | null>("/user/me?settings=false");
}
