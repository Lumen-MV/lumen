// Helpers for the independent Phase 2 QA scripts (tests/qa-*-phase2-extra*.mjs):
// cookie-jar fetch client, direct TMDB calls (token read from .env.local, never printed), read-only SQLite access.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { readEnv } from "./qa-shared-helpers.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ENV = readEnv(ROOT);

/** Minimal cookie-jar HTTP client against the dev server. */
export function makeClient(base) {
  const jar = new Map();
  async function req(method, p, body, extraHeaders = {}) {
    const headers = { ...extraHeaders };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (jar.size) headers.cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    const t0 = Date.now();
    const res = await fetch(base + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
    for (const sc of res.headers.getSetCookie?.() ?? []) {
      const [pair] = sc.split(";");
      const i = pair.indexOf("=");
      const k = pair.slice(0, i).trim(), v = pair.slice(i + 1).trim();
      if (/max-age=0/i.test(sc)) jar.delete(k); else jar.set(k, v);
    }
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* html */ }
    return { status: res.status, json, text, ms: Date.now() - t0, location: res.headers.get("location") };
  }
  return {
    get: (p, h) => req("GET", p, undefined, h), post: (p, b) => req("POST", p, b), del: (p, b) => req("DELETE", p, b), patch: (p, b) => req("PATCH", p, b),
    raw: (method, p, body, headers) => req(method, p, body, headers), cookieHeader: () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; "),
  };
}

/** Direct TMDB v3 call with the same defaults as the app (language=vi-VN unless overridden). The token stays in memory. */
export async function tmdbDirect(p, params = {}) {
  const token = ENV.TMDB_READ_TOKEN;
  if (!token) throw new Error("TMDB_READ_TOKEN missing in .env.local");
  const url = new URL("https://api.themoviedb.org/3" + p);
  url.searchParams.set("language", "vi-VN");
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  if (!res.ok) throw new Error(`TMDB ${res.status} ${p}`);
  return res.json();
}

/** Read-only handle on the dev SQLite file (WAL → safe while the server runs). */
export function openDbReadonly() {
  const Database = require(path.join(ROOT, "node_modules", "better-sqlite3"));
  const file = path.resolve(ROOT, ENV.DATA_DIR || "./data", "lumen.sqlite");
  return new Database(file, { readonly: true, fileMustExist: true });
}

/** A currently airing series whose latest season still has unaired episodes → {id, season, unaired, total}. */
export async function findAiringSeriesWithFutureEpisodes() {
  const today = new Date().toISOString().slice(0, 10);
  const onAir = await tmdbDirect("/tv/on_the_air", { page: 1 });
  for (const r of onAir.results.slice(0, 15)) {
    const d = await tmdbDirect(`/tv/${r.id}`);
    const seasons = (d.seasons ?? []).filter((s) => s.season_number > 0);
    const last = seasons[seasons.length - 1];
    if (!last) continue;
    const s = await tmdbDirect(`/tv/${r.id}/season/${last.season_number}`);
    const eps = s.episodes ?? [];
    const unaired = eps.filter((e) => e.air_date && e.air_date > today).length;
    const aired = eps.length - unaired;
    if (unaired > 0 && aired > 0) return { id: r.id, name: d.name, season: last.season_number, unaired, total: eps.length, firstFutureAirDate: eps.find((e) => e.air_date > today)?.air_date };
  }
  return null;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
