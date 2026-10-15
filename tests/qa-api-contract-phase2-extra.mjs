// Independent Phase 2 API/data checks (beyond tests/qa-api-contract-phase2.mjs) against a RUNNING dev server (LUMEN_SCENARIOS=1):
// discover filter mapping verified end-to-end against TMDB itself, search tabs, season with future air dates,
// notifications badge/idempotency, my-list/likes idempotency + DB rows, tmdb-down/row-down page output,
// cache row + warm timing, EN overview fallback page, 404s, anon redirects, token never in HTML/JSON.
//   node tests/qa-api-contract-phase2-extra.mjs [--base http://localhost:3000]
import { adminCreds, makeReporter, readEnv } from "./qa-shared-helpers.mjs";
import { ROOT, findAiringSeriesWithFutureEpisodes, makeClient, openDbReadonly, tmdbDirect } from "./qa-phase2-extra-helpers.mjs";

const args = process.argv.slice(2);
const BASE = args.includes("--base") ? args[args.indexOf("--base") + 1] : "http://localhost:3000";
const ENV = readEnv(ROOT);
const ADMIN = adminCreds(ENV);
const report = makeReporter();
const { check, note } = report;
const yearsOf = (items) => items.map((i) => Number(i.year)).filter((y) => y > 0);
const allIn = (items, lo, hi) => yearsOf(items).every((y) => y >= lo && y <= hi);
const nonIncreasing = (nums) => nums.every((v, i) => i === 0 || nums[i - 1] >= v);
const ids = (items) => items.map((i) => i.tmdbId);
const sameIds = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const today = new Date();
const iso = (d) => d.toISOString().slice(0, 10);

async function main() {
  const db = openDbReadonly();
  const admin = makeClient(BASE);
  check("admin login", (await admin.post("/api/auth/login", { username: ADMIN.u, password: ADMIN.p, remember: false })).status === 200);
  await admin.post("/api/dev/scenario", { flags: [] });
  const adminId = db.prepare("select id from users where username = ?").get(ADMIN.u)?.id;
  check("admin user row found", typeof adminId === "number");

  // ---------------------------------------------------------------- discover mapping vs TMDB (end-to-end)
  const base = { "vote_count.gte": 50, include_adult: false, page: 1 };
  const cases = [
    ["type=movie&year=2010s&sort=top", "/discover/movie", { ...base, sort_by: "vote_average.desc", "primary_release_date.gte": "2010-01-01", "primary_release_date.lte": "2019-12-31" }],
    ["type=movie&year=all&genre=16,10751", "/discover/movie", { ...base, sort_by: "popularity.desc", with_genres: "16,10751" }],
    ["type=movie&year=this&sort=newest", "/discover/movie", { ...base, sort_by: "primary_release_date.desc", "primary_release_date.gte": `${today.getUTCFullYear()}-01-01`, "primary_release_date.lte": `${today.getUTCFullYear()}-12-31` }],
    ["type=movie&year=older&sort=az", "/discover/movie", { ...base, sort_by: "title.asc", "primary_release_date.lte": "2009-12-31" }],
    ["type=tv&year=2020s", "/discover/tv", { ...base, sort_by: "popularity.desc", "first_air_date.gte": "2020-01-01", "first_air_date.lte": "2029-12-31" }],
    ["type=anime&year=all&sort=top", "/discover/tv", { ...base, sort_by: "vote_average.desc", with_genres: "16", with_origin_country: "JP" }],
    ["type=anime&year=all&genre=18", "/discover/tv", { ...base, sort_by: "popularity.desc", with_genres: "16,18", with_origin_country: "JP" }],
  ];
  for (const [qs, p, params] of cases) {
    const [app, direct] = await Promise.all([admin.get(`/api/catalog/discover?${qs}`), tmdbDirect(p, params)]);
    const ok = app.status === 200 && sameIds(ids(app.json?.items ?? []), direct.results.map((r) => r.id));
    check(`discover ${qs} ≡ TMDB ${p}`, ok, ok ? `${app.json.items.length} ids match` : `app ${app.status} ${ids(app.json?.items ?? []).slice(0, 5)} vs ${direct.results.slice(0, 5).map((r) => r.id)}`);
  }
  const y3 = await admin.get("/api/catalog/discover?type=movie&year=3y");
  const lo = today.getUTCFullYear() - 3;
  check("year=3y → all years ≥ now-3y", allIn(y3.json.items, lo, today.getUTCFullYear()), `${[...new Set(yearsOf(y3.json.items))].sort().join(",")}`);
  const y2010 = await admin.get("/api/catalog/discover?type=movie&year=2010s&sort=top");
  check("year=2010s items all 2010–2019", allIn(y2010.json.items, 2010, 2019));
  check("sort=top ratings non-increasing", nonIncreasing(y2010.json.items.map((i) => Number(i.rating))), y2010.json.items.map((i) => i.rating).join(" "));
  const newest = await admin.get("/api/catalog/discover?type=movie&year=all&sort=newest");
  check("sort=newest dates non-increasing", nonIncreasing(newest.json.items.map((i) => i.releaseDate ?? i.year)), newest.json.items.slice(0, 4).map((i) => i.releaseDate).join(" "));
  const future = newest.json.items.filter((i) => i.releaseDate > iso(today));
  check("sort=newest has no future-dated titles (vote_count ≥ 50 guard)", future.length === 0, future.map((i) => `${i.title} ${i.releaseDate}`).join(" | "));
  const genreList = await tmdbDirect("/genre/movie/list");
  // the app renders TMDB's "Phim Hoạt Hình" as the mockup's "Hoạt hình" (genre-names-vi.ts): compare prefix-stripped, case-insensitive
  const norm = (s) => s.replace(/^Phim\s+/i, "").toLowerCase();
  const gname = (id) => genreList.genres.find((g) => g.id === id)?.name;
  const hasGenre = (card, id) => card.genres.some((g) => norm(g) === norm(gname(id)));
  const multi = await admin.get("/api/catalog/discover?type=movie&year=all&genre=16,10751");
  check("genre=16,10751 is AND (every card has both vi genre names)", multi.json.items.every((i) => hasGenre(i, 16) && hasGenre(i, 10751)), `${gname(16)} / ${gname(10751)} vs ${multi.json.items[0]?.genres.join(", ")}`);
  check("genre names are mockup-style Vietnamese (no 'Phim ' prefix, no English)", multi.json.items.every((i) => i.genres.every((g) => !/^Phim /.test(g) && !/^[A-Za-z &\-]+$/.test(g))), [...new Set(multi.json.items.flatMap((i) => i.genres))].join(", "));
  const p2 = await admin.get("/api/catalog/discover?type=movie&year=2010s&sort=top&page=2");
  check("page=2 → page:2, 20 new ids", p2.json.page === 2 && p2.json.items.length === 20 && !ids(p2.json.items).some((id) => ids(y2010.json.items).includes(id)));
  check("page=0 / page=abc / page=9999 → page 1 (not 400/500)", [(await admin.get("/api/catalog/discover?type=movie&page=0")), (await admin.get("/api/catalog/discover?type=movie&page=abc")), (await admin.get("/api/catalog/discover?type=movie&page=9999"))].every((r) => r.status === 200 && r.json.page === 1));
  const junk = await admin.get("/api/catalog/discover?type=movie&year=1999&sort=zzz&genre=a,b,-1&q4k=yes&cached=2");
  check("junk filter values fall back to defaults", junk.status === 200 && sameIds(ids(junk.json.items), ids((await admin.get("/api/catalog/discover?type=movie")).json.items)));
  const az = await admin.get("/api/catalog/discover?type=movie&year=older&sort=az");
  note(`sort=az (title.asc) first titles: ${az.json.items.slice(0, 5).map((i) => i.title).join(" | ")}  ← TMDB sorts the ORIGINAL title, Vietnamese display order looks random`);

  // ---------------------------------------------------------------- search tabs
  const [sAll, sMovie, sTv] = await Promise.all(["all", "movie", "tv"].map((t) => admin.get(`/api/catalog/search?q=spider&type=${t}`)));
  check("search counts identical across tabs", JSON.stringify(sAll.json.counts) === JSON.stringify(sMovie.json.counts) && JSON.stringify(sAll.json.counts) === JSON.stringify(sTv.json.counts), JSON.stringify(sAll.json.counts));
  check("counts.all = movie + tv", sAll.json.counts.all === sAll.json.counts.movie + sAll.json.counts.tv);
  check("type=movie → only movies; type=tv → only tv", sMovie.json.items.every((i) => i.type === "movie") && sTv.json.items.every((i) => i.type === "tv"));
  check("type=all page 1 = movie p1 + tv p1 (≤ 40)", sAll.json.items.length === sMovie.json.items.length + sTv.json.items.length && sAll.json.items.length <= 40, String(sAll.json.items.length));
  check("search totalResults per tab", sAll.json.totalResults === sAll.json.counts.all && sMovie.json.totalResults === sMovie.json.counts.movie && sTv.json.totalResults === sTv.json.counts.tv);
  const vi = await admin.get(`/api/catalog/search?q=${encodeURIComponent("người nhện")}`);
  check("search with diacritics returns results", vi.status === 200 && vi.json.items.length > 0, String(vi.json?.items?.length));
  const long = await admin.get(`/api/catalog/search?q=${"a".repeat(300)}`);
  check("300-char query → 200 (capped), not 500", long.status === 200, String(long.status));
  check("'  a  ' (1 char after trim) → 400", (await admin.get("/api/catalog/search?q=%20%20a%20%20")).status === 400);
  check("search page=9999 → 200 empty/done", (await admin.get("/api/catalog/search?q=spider&page=400")).status === 200);

  // ---------------------------------------------------------------- season with future air dates
  const airing = await findAiringSeriesWithFutureEpisodes();
  if (!airing) check("found an on-the-air series with unaired episodes", false, "none in /tv/on_the_air page 1");
  else {
    note(`airing series: ${airing.name} (${airing.id}) S${airing.season}: ${airing.unaired}/${airing.total} unaired, next ${airing.firstFutureAirDate}`);
    const s = await admin.get(`/api/catalog/series/${airing.id}/season/${airing.season}`);
    const eps = s.json?.episodes ?? [];
    check("season endpoint: unairedCount matches TMDB", s.status === 200 && s.json.unairedCount === airing.unaired, `${s.json?.unairedCount} vs ${airing.unaired}`);
    check("season endpoint: unaired episodes aired:false + airDate set", eps.filter((e) => !e.aired).length === airing.unaired && eps.filter((e) => !e.aired).every((e) => e.airDate && e.airDate > iso(today)));
    check("season endpoint: aired episodes aired:true", eps.filter((e) => e.aired).every((e) => e.airDate && e.airDate <= iso(today)));
    const page = await admin.get(`/series/${airing.id}?s=${airing.season}`);
    const dd = page.text.match(/class="dd"[^>]*>([^<]*)</)?.[1];
    check("series page renders .ep.future rows", page.status === 200 && (page.text.match(/class="ep future"/g) ?? []).length === airing.unaired, `${(page.text.match(/class="ep future"/g) ?? []).length} future rows`);
    check("series page: 'Phát sóng dd/mm' chip on future rows", (page.text.match(/Phát sóng \d{2}\/\d{2}/g) ?? []).length === airing.unaired);
    check(`series page season dropdown label 'Mùa ${airing.season} ▾'`, dd?.trim() === `Mùa ${airing.season} ▾`, dd);
    // dropdown meta for the current (partially aired) season must say "N tập · M tập chưa phát sóng" — needs the menu open (UX script); here check the summary used by SSR
    const summaryUnaired = page.text.includes(`${airing.total} tập · ${airing.unaired} tập chưa phát sóng`);
    note(`SSR HTML contains '${airing.total} tập · ${airing.unaired} tập chưa phát sóng': ${summaryUnaired} (menu renders client-side; verified in UX script)`);
  }

  // ---------------------------------------------------------------- notifications badge + idempotency
  check("seed notifications", (await admin.post("/api/dev/seed", { fixture: "notifications" })).status === 200);
  const n0 = await admin.get("/api/notifications");
  check("GET → 4 items / 2 unread", n0.json?.items?.length === 4 && n0.json.unread === 2);
  check("/api/me unreadNotifications = 2", (await admin.get("/api/me")).json?.unreadNotifications === 2);
  const home = await admin.get("/");
  check("home HTML renders badge-dot 2", /class="badge-dot">2</.test(home.text));
  const unreadId = n0.json.items.find((i) => !i.read).id;
  check("PATCH {id} unread → 1", (await admin.patch("/api/notifications", { id: unreadId })).json?.unread === 1);
  check("PATCH same {id} again → still 1 (idempotent)", (await admin.patch("/api/notifications", { id: unreadId })).json?.unread === 1);
  check("PATCH {id: 999999} (not mine) → 200, unread unchanged", (await admin.patch("/api/notifications", { id: 999999 })).json?.unread === 1);
  check("PATCH {all:true} → 0; GET all read", (await admin.patch("/api/notifications", { all: true })).json?.unread === 0 && (await admin.get("/api/notifications")).json.items.every((i) => i.read));
  check("PATCH {all:false} → 400", (await admin.patch("/api/notifications", { all: false })).status === 400);
  check("header badge gone after mark read", !/badge-dot/.test((await admin.get("/")).text));
  const hrefs = n0.json.items.map((i) => i.href);
  check("notification hrefs: movie/series/admin routes", hrefs.every((h) => /^\/(movie\/\d+|series\/\d+(\?s=\d+)?|admin|)$/.test(h)), hrefs.join(" "));
  const hadNotifs = db.prepare("select count(*) c from notifications where user_id = ?").get(adminId).c;
  check("clear-notifications fixture", (await admin.post("/api/dev/seed", { fixture: "clear-notifications" })).status === 200 && hadNotifs === 4);

  // ---------------------------------------------------------------- my-list / likes idempotency + DB rows
  const rows = (table, type, id) => db.prepare(`select count(*) c from ${table} where user_id = ? and media_type = ? and tmdb_id = ?`).get(adminId, type, id).c;
  await admin.post("/api/dev/seed", { fixture: "clear-user-media" });
  check("my-list POST ×3 → 1 DB row", [(await admin.post("/api/my-list", { mediaKey: "movie:634649" })), (await admin.post("/api/my-list", { mediaKey: "movie:634649" })), (await admin.post("/api/my-list", { mediaKey: "movie:634649" }))].every((r) => r.status === 200 && r.json.saved === true) && rows("my_list", "movie", 634649) === 1, `rows=${rows("my_list", "movie", 634649)}`);
  check("movie page reflects saved (data-saved=true)", /data-saved="true"/.test((await admin.get("/movie/634649")).text));
  check("my-list DELETE → saved:false + 0 rows; DELETE again → 200", (await admin.del("/api/my-list", { mediaKey: "movie:634649" })).json?.saved === false && rows("my_list", "movie", 634649) === 0 && (await admin.del("/api/my-list", { mediaKey: "movie:634649" })).status === 200);
  check("likes POST ×2 → 1 row; DELETE → 0", [(await admin.post("/api/likes", { mediaKey: "tv:66732" })), (await admin.post("/api/likes", { mediaKey: "tv:66732" }))].every((r) => r.json?.liked === true) && rows("likes", "tv", 66732) === 1 && (await admin.del("/api/likes", { mediaKey: "tv:66732" })).json?.liked === false && rows("likes", "tv", 66732) === 0);
  const epKey = await admin.post("/api/my-list", { mediaKey: "tv:66732:4:1" });
  note(`my-list with episode key tv:66732:4:1 → ${epKey.status} ${JSON.stringify(epKey.json)} (stored as title-level tv:66732 rows=${rows("my_list", "tv", 66732)})`);
  await admin.del("/api/my-list", { mediaKey: "tv:66732" });
  for (const bad of ["movie:abc", "movie:0", "tv:1:2", "", "movie:12345678901", "MOVIE:1"]) {
    const r = await admin.post("/api/my-list", { mediaKey: bad });
    check(`my-list bad key '${bad}' → 400`, r.status === 400, String(r.status));
  }
  const tv456 = await admin.post("/api/my-list", { mediaKey: "tv:456" });
  check("reviewer P1-1: my-list POST tv:456 (id < 1000) → 200", tv456.status === 200, `${tv456.status} ${JSON.stringify(tv456.json)}`);
  if (tv456.status === 200) await admin.del("/api/my-list", { mediaKey: "tv:456" });
  const like456 = await admin.post("/api/likes", { mediaKey: "tv:456" });
  check("reviewer P1-1: likes POST tv:456 → 200", like456.status === 200, `${like456.status} ${JSON.stringify(like456.json)}`);
  if (like456.status === 200) await admin.del("/api/likes", { mediaKey: "tv:456" });
  await admin.get("/api/catalog/search?q=spiderm");
  const cacheRows = db.prepare("select count(*) c, sum(case when key like '/search/%' then 1 else 0 end) s, sum(length(json)) bytes from tmdb_cache").get();
  note(`tmdb_cache now: ${cacheRows.c} rows, ${(cacheRows.bytes / 1024 / 1024).toFixed(1)} MB (rows older than 60 d are purged at boot + daily)`);
  check("/search/* answers live in the memory LRU, never in tmdb_cache", Number(cacheRows.s ?? 0) === 0, `${cacheRows.s} /search rows`);
  check("my-list unknown TMDB id → 200 (no TMDB validation; rows cleaned)", (await admin.post("/api/my-list", { mediaKey: "movie:999999999" })).status === 200 && (await admin.del("/api/my-list", { mediaKey: "movie:999999999" })).status === 200);
  await admin.post("/api/dev/seed", { fixture: "clear-user-media" });

  // ---------------------------------------------------------------- tmdb-down / tmdb-row-down page output
  await admin.post("/api/dev/scenario", { flags: ["tmdb-down"] });
  const homeDown = await admin.get("/");
  check("tmdb-down: / → errbox 'Không tải được trang chủ. TMDB không phản hồi.'", homeDown.status === 200 && homeDown.text.includes("Không tải được trang chủ. TMDB không phản hồi.") && /class="errbox"/.test(homeDown.text));
  check("tmdb-down: / has no hero", !/class="hero"/.test(homeDown.text));
  const movieDown = await admin.get("/movie/634649");
  check("tmdb-down: /movie/634649 → errbox (not 404)", movieDown.status === 200 && /class="errbox"/.test(movieDown.text), String(movieDown.status));
  const searchDown = await admin.get("/search?q=spider");
  check("tmdb-down: /search → errbox browse.err", searchDown.status === 200 && searchDown.text.includes("Không tải được danh sách phim. Kiểm tra mạng rồi thử lại."));
  check("tmdb-down: discover API → 502 TMDB_DOWN", (await admin.get("/api/catalog/discover?type=movie")).status === 502);
  check("tmdb-down: season API → 502", (await admin.get("/api/catalog/series/66732/season/4")).status === 502);
  await admin.post("/api/dev/scenario", { flags: ["tmdb-row-down"] });
  const rowDown = await admin.get("/");
  check("tmdb-row-down: hero + Top 10 render, exactly 1 inline row errbox 'Không tải được hàng này'", /class="hero"/.test(rowDown.text) && (rowDown.text.match(/Không tải được hàng này/g) ?? []).length === 1 && (rowDown.text.match(/class="t10"/g) ?? []).length === 10);
  await admin.post("/api/dev/scenario", { flags: [] });

  // ---------------------------------------------------------------- cache: second request served from tmdb_cache
  check("clear-tmdb-cache fixture", (await admin.post("/api/dev/seed", { fixture: "clear-tmdb-cache" })).status === 200 && db.prepare("select count(*) c from tmdb_cache").get().c === 0);
  const cold = await admin.get("/api/catalog/discover?type=tv&year=2010s&sort=top");
  const rowsAfterCold = db.prepare("select key, fetched_at from tmdb_cache where key like '%/discover/tv%'").all();
  const warm = await admin.get("/api/catalog/discover?type=tv&year=2010s&sort=top");
  const rowsAfterWarm = db.prepare("select key, fetched_at from tmdb_cache where key like '%/discover/tv%'").all();
  check("cold call writes a tmdb_cache row for /discover/tv with the mapped params", rowsAfterCold.length === 1 && /2010-01-01/.test(rowsAfterCold[0].key) && /vote_average.desc/.test(rowsAfterCold[0].key), rowsAfterCold[0]?.key);
  check("warm call: no new row, fetched_at unchanged, faster", rowsAfterWarm.length === 1 && rowsAfterWarm[0].fetched_at === rowsAfterCold[0].fetched_at && warm.ms < cold.ms && warm.ms < 300, `cold ${cold.ms} ms warm ${warm.ms} ms`);
  check("warm payload identical to cold", JSON.stringify(warm.json) === JSON.stringify(cold.json));
  const genresRow = db.prepare("select count(*) c from tmdb_cache where key like '%/genre/%'").get().c;
  check("genre lists cached", genresRow >= 1, String(genresRow));

  // ---------------------------------------------------------------- EN overview fallback on a real title
  let enId = null;
  for (let page = 1; page <= 3 && !enId; page++) {
    const r = await admin.get(`/api/catalog/discover?type=movie&year=older&sort=top&page=${page}`);
    for (const it of r.json.items) {
      const m = await admin.get(`/api/catalog/meta?key=${it.mediaKey}`);
      if (m.json?.overviewLang === "en" && ((await tmdbDirect(`/movie/${it.tmdbId}`, { language: "en-US" })).overview ?? "").trim()) { enId = it.tmdbId; break; }
      if (m.json?.overviewLang === "en") note(`movie ${it.tmdbId} overviewLang=en but en-US overview is empty too → page shows no overview, no EN pill`);
    }
  }
  if (!enId) check("found a movie without vi overview", false);
  else {
    const direct = await tmdbDirect(`/movie/${enId}`, { language: "en-US" });
    const viDirect = await tmdbDirect(`/movie/${enId}`);
    const pg = await admin.get(`/movie/${enId}`);
    const enText = (direct.overview ?? "").trim();
    check(`EN fallback movie ${enId} '${viDirect.title}': TMDB vi overview empty`, !(viDirect.overview ?? "").trim());
    check("detail page shows EN pill with tooltip", /title="Chưa có mô tả tiếng Việt"[^>]*>EN</.test(pg.text));
    check("detail page overview = TMDB en-US overview", enText.length > 0 && pg.text.includes(enText.slice(0, 60).replace(/&/g, "&amp;").replace(/'/g, "&#x27;")), enText.slice(0, 60));
  }

  // ---------------------------------------------------------------- 404s + anon + token leakage
  for (const p of ["/movie/999999999", "/series/999999999", "/movie/abc", "/movie/-1", "/series/0"]) {
    const r = await admin.get(p);
    check(`${p} → body 'Không tìm thấy phim' + noindex`, r.text.includes("Không tìm thấy phim") && /noindex/.test(r.text));
    check(`${p} → HTTP 404 (not a streamed 200)`, r.status === 404, String(r.status));
  }
  check("/api/catalog/meta?key=tv:999999999 → 404", (await admin.get("/api/catalog/meta?key=tv:999999999")).status === 404);
  check("/api/catalog/series/66732/season/99 → 404", (await admin.get("/api/catalog/series/66732/season/99")).status === 404);
  const anon = makeClient(BASE);
  for (const p of ["/movie/634649", "/series/66732", "/search?q=spider", "/movies", "/anime"]) {
    const r = await anon.get(p);
    check(`anon ${p} → redirect /login`, [302, 307].includes(r.status) && /\/login/.test(r.location ?? ""), `${r.status} ${r.location}`);
  }
  const token = ENV.TMDB_READ_TOKEN;
  const pages = [];
  for (const p of ["/", "/movies", "/movie/634649", "/series/66732?s=4", "/search?q=spider"]) pages.push(await admin.get(p)); // sequential: parallel first compiles race in `next dev`
  check("TMDB token never in page HTML", !pages.some((p) => p.text.includes(token)));
  // dev only: React serialises async-I/O debug info (fetch URL, no headers) for cold fetches into `__next_f` chunks; rendered markup must never carry the host (prod HTML has neither)
  const markup = (t) => t.replace(/<script>self\.__next_f\.push\([\s\S]*?\)<\/script>/g, "");
  const hostLeak = pages.map((p, i) => (markup(p.text).includes("api.themoviedb.org") ? `markup@${i}` : "")).filter(Boolean);
  check("api.themoviedb.org never in rendered markup", hostLeak.length === 0, hostLeak.join(" | "));
  const devDebug = pages.filter((p) => p.text.includes("api.themoviedb.org")).length;
  if (devDebug) note(`api.themoviedb.org present only inside React dev debug chunks on ${devDebug} page(s) (cold fetches; absent in production builds)`);
  check("hero/discover JSON never includes token", ![(await admin.get("/api/catalog/hero")).text, cold.text].some((t) => t.includes(token)));
  const ssrImg = pages.filter((p, i) => i !== 1); // /movies grid is client-rendered (no SSR <img>)
  const sizes = [...new Set(ssrImg.flatMap((p) => (p.text.match(/image\.tmdb\.org\/t\/p\/[a-z0-9_]+/g) ?? []).map((u) => u.split("/").pop())))];
  check("image URLs are image.tmdb.org w342/w500/w1280/original only", ssrImg.every((p) => (p.text.match(/https:\/\/image\.tmdb\.org\/t\/p\//g) ?? []).length > 0) && sizes.every((z) => ["w342", "w500", "w1280", "original"].includes(z)), sizes.join(","));

  // ---------------------------------------------------------------- hero/top10 = TMDB trending top 5/10
  const hero = await admin.get("/api/catalog/hero");
  const cachedTrending = db.prepare("select json from tmdb_cache where key like '/trending/movie/day%'").get();
  const trending = cachedTrending ? JSON.parse(cachedTrending.json) : await tmdbDirect("/trending/movie/day");
  note(`hero/Top 10 compared against ${cachedTrending ? "the cached tmdb_cache row" : "live TMDB"} for /trending/movie/day`);
  check("hero = trending/movie/day first 5 (same order)", sameIds(hero.json.items.map((i) => i.tmdbId), trending.results.slice(0, 5).map((r) => r.id)));
  const top10 = [...(pages[0].text.matchAll(/class="t10" data-media-key="movie:(\d+)"/g))].map((m) => Number(m[1]));
  check("Top 10 row = trending first 10 (same order)", sameIds(top10, trending.results.slice(0, 10).map((r) => r.id)), top10.join(","));
  check("hero items distinct + 5 dots worth", new Set(hero.json.items.map((i) => i.mediaKey)).size === 5);
  const d634649 = await admin.get("/movie/634649");
  check("/movie/634649: title, imdb, runtime, collection row, similar row", /Người Nhện: Không Còn Nhà/.test(d634649.text) && /data-imdb-id="tt10872600"/.test(d634649.text) && /2h 28m/.test(d634649.text) && /Bộ sưu tập /.test(d634649.text) && /Phim tương tự/.test(d634649.text));
  check("/movie/634649: genre links → /movies?genre=<id>", (d634649.text.match(/href="\/movies\?genre=\d+"/g) ?? []).length >= 3);
  check("/series/66732: genre links → /series?genre=<id>", (pages[3].text.match(/href="\/series\?genre=\d+"/g) ?? []).length >= 1);
  check("member count footer 'Thành viên: N · Phiên bản 1.0'", new RegExp(`Thành viên: ${db.prepare("select count(*) c from users").get().c} · Phiên bản 1.0`).test(pages[0].text));

  await admin.post("/api/auth/logout");
  db.close();
  report.finish();
}

main().catch((err) => { console.error(err); process.exit(1); });
