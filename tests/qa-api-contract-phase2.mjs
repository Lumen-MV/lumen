// Phase 2 API contract checks against a RUNNING dev server (LUMEN_SCENARIOS=1): catalog hero/discover/search/season/meta,
// my-list, likes, notifications GET/PATCH, auth gating, scenario tmdb-down → 502, token never in client bundle.
//   node tests/qa-api-contract-phase2.mjs [--base http://localhost:3000]
// Reads ADMIN_USERNAME / ADMIN_PASSWORD from .env.local and never prints them.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { adminCreds, makeReporter, readEnv } from "./qa-shared-helpers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const BASE = args.includes("--base") ? args[args.indexOf("--base") + 1] : "http://localhost:3000";
const ENV = readEnv(ROOT);
const ADMIN = adminCreds(ENV);
const report = makeReporter();
const { check } = report;

function client() {
  const jar = new Map();
  async function req(method, p, body) {
    const headers = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (jar.size) headers.cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await fetch(BASE + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
    for (const sc of res.headers.getSetCookie?.() ?? []) {
      const [pair] = sc.split(";");
      const i = pair.indexOf("=");
      const k = pair.slice(0, i).trim(), v = pair.slice(i + 1).trim();
      if (/max-age=0/i.test(sc)) jar.delete(k); else jar.set(k, v);
    }
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
    return { status: res.status, json, text };
  }
  return { get: (p) => req("GET", p), post: (p, b) => req("POST", p, b), del: (p, b) => req("DELETE", p, b), patch: (p, b) => req("PATCH", p, b) };
}

const isCard = (c) => c && typeof c.mediaKey === "string" && /^(movie|tv):\d+$/.test(c.mediaKey) && typeof c.title === "string" && typeof c.year === "string" && typeof c.rating === "string" && Array.isArray(c.genres);

async function main() {
  const anon = client();
  // ---- auth gating
  for (const p of ["/api/catalog/hero", "/api/catalog/discover?type=movie", "/api/catalog/search?q=dune", "/api/catalog/meta?key=movie:1", "/api/catalog/series/66732/season/1", "/api/notifications"]) {
    const r = await anon.get(p);
    check(`anon GET ${p} → 401`, r.status === 401, String(r.status));
  }
  check("anon POST /api/my-list → 401", (await anon.post("/api/my-list", { mediaKey: "movie:1" })).status === 401);

  const admin = client();
  const login = await admin.post("/api/auth/login", { username: ADMIN.u, password: ADMIN.p, remember: false });
  check("admin login", login.status === 200, String(login.status));
  await admin.post("/api/dev/scenario", { flags: [] });

  // ---- hero
  const hero = await admin.get("/api/catalog/hero");
  check("hero 200 + 5 items", hero.status === 200 && hero.json?.items?.length === 5, `${hero.status} ${hero.json?.items?.length}`);
  const h0 = hero.json?.items?.[0];
  check("hero item shape", h0 && /^movie:\d+$/.test(h0.mediaKey) && typeof h0.backdropUrl === "string" && typeof h0.age === "string" && ["vi", "en"].includes(h0.overviewLang) && typeof h0.saved === "boolean" && typeof h0.runtime === "string");
  check("hero age label", h0 && /^(\d{2}\+|P)$/.test(h0.age), h0?.age);

  // ---- discover
  const d1 = await admin.get("/api/catalog/discover?type=movie");
  check("discover movie page 1", d1.status === 200 && d1.json?.items?.length === 20 && d1.json.page === 1 && d1.json.done === false && d1.json.totalResults > 20, `${d1.status} n=${d1.json?.items?.length}`);
  check("discover card shape", d1.json?.items?.every(isCard) && d1.json.items.every((c) => c.type === "movie"));
  const d2 = await admin.get("/api/catalog/discover?type=movie&page=2");
  check("discover page 2 differs", d2.status === 200 && d2.json.page === 2 && d2.json.items[0]?.mediaKey !== d1.json.items[0]?.mediaKey);
  const dtv = await admin.get("/api/catalog/discover?type=tv&year=2010s&sort=top&genre=18");
  check("discover tv with filters", dtv.status === 200 && dtv.json.items.every((c) => c.type === "tv" && /^201\d$/.test(c.year)), dtv.json?.items?.slice(0, 3).map((c) => c.year).join(","));
  const anime = await admin.get("/api/catalog/discover?type=anime");
  check("discover anime", anime.status === 200 && anime.json.items.length > 0 && anime.json.items.every((c) => c.type === "tv"));
  const empty = await admin.get("/api/catalog/discover?type=movie&genre=16,37,10752,27");
  check("discover impossible genre AND → empty + done", empty.status === 200 && empty.json.items.length === 0 && empty.json.done === true && empty.json.totalResults === 0);
  check("discover bad type → 400", (await admin.get("/api/catalog/discover?type=person")).status === 400);
  const badPage = await admin.get("/api/catalog/discover?type=movie&page=abc");
  check("discover bad page → page 1", badPage.status === 200 && badPage.json.page === 1);

  // ---- search
  const s = await admin.get("/api/catalog/search?q=spider");
  check("search spider", s.status === 200 && s.json.items.length > 0 && s.json.counts.all === s.json.counts.movie + s.json.counts.tv && s.json.counts.all > 0, JSON.stringify(s.json?.counts));
  check("search no person results", s.json?.items?.every((c) => c.type === "movie" || c.type === "tv"));
  const sm = await admin.get("/api/catalog/search?q=spider&type=movie");
  check("search type=movie filters", sm.status === 200 && sm.json.items.every((c) => c.type === "movie") && sm.json.totalResults === sm.json.counts.movie);
  const sEmpty = await admin.get("/api/catalog/search?q=" + encodeURIComponent("xqzvv phim gi do"));
  check("search nonsense → empty + done", sEmpty.status === 200 && sEmpty.json.items.length === 0 && sEmpty.json.done === true);
  check("search 1 char → 400", (await admin.get("/api/catalog/search?q=s")).status === 400);
  check("search bad type → 400", (await admin.get("/api/catalog/search?q=dune&type=person")).status === 400);

  // ---- season + meta
  const season = await admin.get("/api/catalog/series/66732/season/4");
  const ep = season.json?.episodes?.[0];
  check("season 4 of 66732", season.status === 200 && season.json.episodes.length >= 9 && ep && ep.n === 1 && typeof ep.title === "string" && typeof ep.aired === "boolean" && (ep.runtimeMin === null || typeof ep.runtimeMin === "number"), `${season.status} n=${season.json?.episodes?.length}`);
  check("season unknown series → 404", (await admin.get("/api/catalog/series/999999999/season/1")).status === 404);
  check("season bad n → 400", (await admin.get("/api/catalog/series/66732/season/x")).status === 400);
  const meta = await admin.get("/api/catalog/meta?key=movie:634649");
  check("meta movie:634649", meta.status === 200 && meta.json.year === "2021" && /^\d+h \d+m$/.test(meta.json.runtime) && ["vi", "en"].includes(meta.json.overviewLang), JSON.stringify(meta.json));
  const metaTv = await admin.get("/api/catalog/meta?key=tv:66732");
  check("meta tv:66732 → 'N mùa'", metaTv.status === 200 && /^\d+ mùa$/.test(metaTv.json.runtime), metaTv.json?.runtime);
  check("meta bad key → 400", (await admin.get("/api/catalog/meta?key=person:1")).status === 400);
  check("meta unknown id → 404", (await admin.get("/api/catalog/meta?key=movie:999999999")).status === 404);

  // ---- my-list / likes
  const key = "movie:634649";
  check("my-list POST → saved:true", (await admin.post("/api/my-list", { mediaKey: key })).json?.saved === true);
  check("my-list POST idempotent", (await admin.post("/api/my-list", { mediaKey: key })).json?.saved === true);
  const heroAfter = await admin.get("/api/catalog/hero");
  check("hero reflects saved flag type", heroAfter.json?.items?.every((i) => typeof i.saved === "boolean"));
  check("my-list DELETE → saved:false", (await admin.del("/api/my-list", { mediaKey: key })).json?.saved === false);
  check("my-list bad key → 400", (await admin.post("/api/my-list", { mediaKey: "nope" })).status === 400);
  check("my-list bad json → 400", (await admin.post("/api/my-list", "not-json")).status === 400);
  check("likes POST → liked:true", (await admin.post("/api/likes", { mediaKey: "tv:66732" })).json?.liked === true);
  check("likes DELETE → liked:false", (await admin.del("/api/likes", { mediaKey: "tv:66732" })).json?.liked === false);
  check("likes bad key → 400", (await admin.post("/api/likes", { mediaKey: "tv:66732:1" })).status === 400);

  // ---- notifications
  const seeded = await admin.post("/api/dev/seed", { fixture: "notifications" });
  check("seed notifications", seeded.status === 200 && seeded.json.count === 4, String(seeded.status));
  const n1 = await admin.get("/api/notifications");
  check("notifications list 4 / unread 2", n1.status === 200 && n1.json.items.length === 4 && n1.json.unread === 2, `${n1.status} ${n1.json?.items?.length}/${n1.json?.unread}`);
  const first = n1.json?.items?.[0];
  check("notification item shape", first && ["cloud_ready", "subtitle_ready", "new_episode", "member_joined"].includes(first.type) && /<b>.*<\/b>/.test(first.html) && typeof first.timeAgo === "string" && first.href.startsWith("/") && typeof first.read === "boolean" && typeof first.icon === "string");
  check("notifications newest first + unread", first?.type === "cloud_ready" && first.read === false && first.href === "/movie/533535");
  const joined = n1.json?.items?.find((i) => i.type === "member_joined");
  check("member_joined → /admin + 3 ngày trước", joined?.href === "/admin" && joined.timeAgo === "3 ngày trước", joined?.timeAgo);
  const p1 = await admin.patch("/api/notifications", { id: first.id });
  check("PATCH {id} → unread 1", p1.status === 200 && p1.json.unread === 1, JSON.stringify(p1.json));
  const p2 = await admin.patch("/api/notifications", { all: true });
  check("PATCH {all:true} → unread 0", p2.status === 200 && p2.json.unread === 0);
  check("PATCH bad body → 400", (await admin.patch("/api/notifications", { id: -1 })).status === 400);
  const me = await admin.get("/api/me");
  check("/api/me unreadNotifications 0 after mark read", me.json?.unreadNotifications === 0, String(me.json?.unreadNotifications));

  // ---- scenarios
  await admin.post("/api/dev/scenario", { flags: ["tmdb-down"] });
  check("tmdb-down → hero 502 TMDB_DOWN", (await admin.get("/api/catalog/hero")).status === 502);
  check("tmdb-down → discover 502", (await admin.get("/api/catalog/discover?type=movie")).status === 502);
  await admin.post("/api/dev/scenario", { flags: ["tmdb-row-down"] });
  check("tmdb-row-down → hero still 200", (await admin.get("/api/catalog/hero")).status === 200);
  await admin.post("/api/dev/scenario", { flags: ["slow-net"] });
  const t0 = Date.now();
  const slow = await admin.get("/api/catalog/discover?type=movie");
  check("slow-net adds ≥ 2 s", slow.status === 200 && Date.now() - t0 >= 2000, `${Date.now() - t0}ms`);
  await admin.post("/api/dev/scenario", { flags: [] });

  // ---- caching: after clearing tmdb_cache the second identical call must be served from SQLite (faster, no TMDB round-trip)
  check("clear tmdb cache fixture", (await admin.post("/api/dev/seed", { fixture: "clear-tmdb-cache" })).status === 200);
  const c0 = Date.now();
  await admin.get("/api/catalog/discover?type=movie&year=2010s&genre=28&sort=top&page=3");
  const cold = Date.now() - c0;
  const c1 = Date.now();
  await admin.get("/api/catalog/discover?type=movie&year=2010s&genre=28&sort=top&page=3");
  const warm = Date.now() - c1;
  check("cache hit is faster than cold fetch", warm <= cold, `cold ${cold}ms warm ${warm}ms`);

  // ---- token never shipped to the browser
  const staticDir = path.join(ROOT, ".next", "static");
  let leaked = false;
  if (fs.existsSync(staticDir) && ENV.TMDB_READ_TOKEN) {
    const walk = (dir) => { for (const f of fs.readdirSync(dir)) { const p = path.join(dir, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(js|css|json)$/.test(f) && fs.readFileSync(p, "utf8").includes(ENV.TMDB_READ_TOKEN)) leaked = true; } };
    walk(staticDir);
  }
  check("TMDB token absent from .next/static", !leaked);

  await admin.post("/api/auth/logout");
  report.finish();
}

main().catch((err) => { console.error(err); process.exit(1); });
